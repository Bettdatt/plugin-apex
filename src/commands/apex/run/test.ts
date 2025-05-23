/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { CancellationTokenSource, TestLevel, TestResult, TestRunIdResult, TestService } from '@salesforce/apex-node';
import {
  arrayWithDeprecation,
  Flags,
  loglevel,
  orgApiVersionFlagWithDeprecations,
  requiredOrgFlagWithDeprecations,
  SfCommand,
  Ux,
} from '@salesforce/sf-plugins-core';
import { Messages, SfError } from '@salesforce/core';
import { Duration } from '@salesforce/kit';
import { RunResult, TestReporter } from '../../../reporters/index.js';
import { codeCoverageFlag, resultFormatFlag } from '../../../flags.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@salesforce/plugin-apex', 'runtest');

export const TestLevelValues = ['RunLocalTests', 'RunAllTestsInOrg', 'RunSpecifiedTests'];
export type RunCommandResult = RunResult | TestRunIdResult;
const exclusiveTestSpecifiers = ['class-names', 'suite-names', 'tests'];
export default class Test extends SfCommand<RunCommandResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');
  public static readonly deprecateAliases = true;
  public static readonly aliases = ['force:apex:test:run'];

  public static readonly flags = {
    'target-org': requiredOrgFlagWithDeprecations,
    'api-version': orgApiVersionFlagWithDeprecations,
    loglevel,
    'code-coverage': codeCoverageFlag,
    'output-dir': Flags.directory({
      aliases: ['outputdir', 'output-directory'],
      deprecateAliases: true,
      char: 'd',
      summary: messages.getMessage('flags.output-dir.summary'),
    }),
    'test-level': Flags.string({
      deprecateAliases: true,
      aliases: ['testlevel'],
      char: 'l',
      summary: messages.getMessage('flags.test-level.summary'),
      description: messages.getMessage('flags.test-level.description'),
      options: TestLevelValues,
    }),
    'class-names': arrayWithDeprecation({
      deprecateAliases: true,
      aliases: ['classnames'],
      char: 'n',
      summary: messages.getMessage('flags.class-names.summary'),
      description: messages.getMessage('flags.class-names.description'),
      exclusive: exclusiveTestSpecifiers.filter((specifier) => specifier !== 'class-names'),
    }),
    'result-format': resultFormatFlag,
    'suite-names': arrayWithDeprecation({
      deprecateAliases: true,
      aliases: ['suitenames'],
      char: 's',
      summary: messages.getMessage('flags.suite-names.summary'),
      description: messages.getMessage('flags.suite-names.description'),
      exclusive: exclusiveTestSpecifiers.filter((specifier) => specifier !== 'suite-names'),
    }),
    tests: arrayWithDeprecation({
      char: 't',
      summary: messages.getMessage('flags.tests.summary'),
      description: messages.getMessage('flags.tests.description'),
      exclusive: exclusiveTestSpecifiers.filter((specifier) => specifier !== 'tests'),
    }),
    // we want to pass `undefined` to the API
    // eslint-disable-next-line sf-plugin/flag-min-max-default
    wait: Flags.duration({
      unit: 'minutes',
      char: 'w',
      summary: messages.getMessage('flags.wait.summary'),
      min: 0,
    }),
    synchronous: Flags.boolean({
      char: 'y',
      summary: messages.getMessage('flags.synchronous.summary'),
    }),
    'detailed-coverage': Flags.boolean({
      deprecateAliases: true,
      aliases: ['detailedcoverage'],
      char: 'v',
      summary: messages.getMessage('flags.detailed-coverage.summary'),
      dependsOn: ['code-coverage'],
    }),
    concise: Flags.boolean({
      summary: messages.getMessage('flags.concise.summary'),
    }),
  };

  protected cancellationTokenSource = new CancellationTokenSource();

  public async run(): Promise<RunCommandResult> {
    const { flags } = await this.parse(Test);

    const testLevel = await validateFlags(
      flags['class-names'],
      flags['suite-names'],
      flags.tests,
      flags.synchronous,
      flags['test-level'] as TestLevel
    );

    // graceful shutdown
    const exitHandler = async (): Promise<void> => {
      await this.cancellationTokenSource.asyncCancel();
      process.exit();
    };

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    process.on('SIGINT', exitHandler);
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    process.on('SIGTERM', exitHandler);

    const conn = flags['target-org'].getConnection(flags['api-version']);
    const testService = new TestService(conn);

    // NOTE: This is a *bug*. Synchronous test runs should throw an error when multiple test classes are specified
    // This was re-introduced due to https://github.com/forcedotcom/salesforcedx-vscode/issues/3154
    // Address with W-9163533
    const result =
      flags.synchronous && testLevel === TestLevel.RunSpecifiedTests
        ? await this.runTest(testService, flags, testLevel)
        : await this.runTestAsynchronous(testService, flags, testLevel);

    if (this.cancellationTokenSource.token.isCancellationRequested) {
      throw new SfError('Cancelled');
    }

    if ('summary' in result) {
      const testReporter = new TestReporter(new Ux({ jsonEnabled: this.jsonEnabled() }), conn);
      return testReporter.report(result, flags);
    } else {
      // Tests were ran asynchronously or the --wait timed out.
      // Log the proper 'apex get test' command for the user to run later
      this.log(messages.getMessage('runTestReportCommand', [this.config.bin, result.testRunId, conn.getUsername()]));
      this.info(messages.getMessage('runTestSyncInstructions'));

      if (flags['output-dir']) {
        // testService writes a file with just the test run id in it to test-run-id.txt
        // github.com/forcedotcom/salesforcedx-apex/blob/c986abfabee3edf12f396f1d2e43720988fa3911/src/tests/testService.ts#L245-L246
        await testService.writeResultFiles(result, { dirPath: flags['output-dir'] }, flags['code-coverage']);
      }

      return result;
    }
  }

  private async runTest(
    testService: TestService,
    flags: {
      tests?: string[];
      'class-names'?: string[];
      'code-coverage'?: boolean;
    },
    testLevel: TestLevel
  ): Promise<TestResult> {
    const payload = {
      ...(await testService.buildSyncPayload(testLevel, flags.tests?.join(','), flags['class-names']?.join(','))),
      skipCodeCoverage: !flags['code-coverage'],
    };

    try {
      return (await testService.runTestSynchronous(
        payload,
        flags['code-coverage'],
        this.cancellationTokenSource.token
      )) as TestResult;
    } catch (e) {
      throw handleTestingServerError(SfError.wrap(e), flags, testLevel);
    }
  }

  private async runTestAsynchronous(
    testService: TestService,
    flags: {
      tests?: string[];
      'class-names'?: string[];
      'suite-names'?: string[];
      'code-coverage'?: boolean;
      synchronous?: boolean;
      'result-format'?: string;
      json?: boolean;
      wait?: Duration;
    },
    testLevel: TestLevel
  ): Promise<TestRunIdResult> {
    const payload = {
      ...(await testService.buildAsyncPayload(
        testLevel,
        flags.tests?.join(','),
        flags['class-names']?.join(','),
        flags['suite-names']?.join(',')
      )),
      skipCodeCoverage: !flags['code-coverage'],
    };

    try {
      // cast as TestRunIdResult because we're building an async payload which will return an async result
      return (await testService.runTestAsynchronous(
        payload,
        flags['code-coverage'],
        flags.wait && flags.wait.minutes > 0 ? false : !(flags.synchronous && !this.jsonEnabled()),
        undefined,
        this.cancellationTokenSource.token,
        flags.wait
      )) as TestRunIdResult;
    } catch (e) {
      throw handleTestingServerError(SfError.wrap(e), flags, testLevel);
    }
  }
}

function handleTestingServerError(
  error: SfError,
  flags: {
    tests?: string[];
    'class-names'?: string[];
    'suite-names'?: string[];
  },
  testLevel: TestLevel
): SfError {
  if (!error.message.includes('Always provide a classes, suites, tests, or testLevel property')) {
    return error;
  }

  // If error message condition is valid, return the original error.
  const hasSpecifiedTestLevel = testLevel === TestLevel.RunSpecifiedTests;
  const hasNoTestNames = !flags.tests?.length;
  const hasNoClassNames = !flags['class-names']?.length;
  const hasNoSuiteNames = !flags['suite-names']?.length;
  if (hasSpecifiedTestLevel && hasNoTestNames && hasNoClassNames && hasNoSuiteNames) {
    return error;
  }

  // Otherwise, assume there are no Apex tests in the org and return clearer message.
  return Object.assign(error, {
    message: 'There are no Apex tests to run in this org.',
    actions: ['Ensure Apex Tests exist in the org, and try again.'],
  });
}

const validateFlags = async (
  classNames?: string[],
  suiteNames?: string[],
  tests?: string[],
  synchronous?: boolean,
  testLevel?: TestLevel
): Promise<TestLevel> => {
  if (synchronous && (Boolean(suiteNames) || (classNames?.length && classNames.length > 1))) {
    return Promise.reject(new Error(messages.getMessage('syncClassErr')));
  }

  if (
    (Boolean(tests) || Boolean(classNames) || suiteNames) &&
    testLevel &&
    testLevel.toString() !== 'RunSpecifiedTests'
  ) {
    return Promise.reject(new Error(messages.getMessage('testLevelErr')));
  }

  if (testLevel) {
    return testLevel;
  }
  if (Boolean(classNames) || Boolean(suiteNames) || tests) {
    return TestLevel.RunSpecifiedTests;
  }
  return TestLevel.RunLocalTests;
};
