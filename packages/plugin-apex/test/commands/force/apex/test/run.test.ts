/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import { TestService } from '@salesforce/apex-node';
import { expect, test } from '@salesforce/command/lib/test';
import { Messages, SfdxProject } from '@salesforce/core';
import * as path from 'path';
import { createSandbox, SinonSandbox } from 'sinon';
import { testRunSimple } from './testData';

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('@salesforce/plugin-apex', 'run');

const SFDX_PROJECT_PATH = 'test-sfdx-project';
const TEST_USERNAME = 'test@example.com';
const projectPath = path.resolve(SFDX_PROJECT_PATH);
const sfdxProjectJson = {
  packageDirectories: [{ path: 'force-app', default: true }],
  namespace: '',
  sfdcLoginUrl: 'https://login.salesforce.com',
  sourceApiVersion: '49.0'
};

describe('force:apex:test:run', () => {
  let sandboxStub: SinonSandbox;

  beforeEach(async () => {
    sandboxStub = createSandbox();
    sandboxStub.stub(SfdxProject, 'resolve').returns(
      Promise.resolve(({
        getPath: () => projectPath,
        resolveProjectConfig: () => sfdxProjectJson
      } as unknown) as SfdxProject)
    );
  });

  afterEach(() => {
    sandboxStub.restore();
  });

  test
    .withOrg({ username: TEST_USERNAME }, true)
    .loadConfig({
      root: __dirname
    })
    .stub(process, 'cwd', () => projectPath)
    .stub(TestService.prototype, 'runTestAsynchronous', () => testRunSimple)
    .stdout()
    .command([
      'force:apex:test:run',
      '--tests',
      'MyApexTests',
      '--resultformat',
      'human'
    ])
    .it('should return a success human format message with async run', ctx => {
      const result = ctx.stdout;
      expect(result).to.not.be.empty;
      expect(result).to.contain('Test Summary');
      expect(result).to.contain('Test Results');
      expect(result).to.not.contain('Apex Code Coverage by Class');
    });

  test
    .withOrg({ username: TEST_USERNAME }, true)
    .loadConfig({
      root: __dirname
    })
    .stub(process, 'cwd', () => projectPath)
    .stub(TestService.prototype, 'runTestSynchronous', () => testRunSimple)
    .stdout()
    .command([
      'force:apex:test:run',
      '--tests',
      'MyApexTests',
      '--resultformat',
      'human',
      '--synchronous'
    ])
    .it('should return a success human format message with sync run', ctx => {
      const result = ctx.stdout;
      expect(result).to.not.be.empty;
      expect(result).to.contain('Test Summary');
      expect(result).to.contain('Test Results');
      expect(result).to.not.contain('Apex Code Coverage by Class');
    });

  test
    .withOrg({ username: TEST_USERNAME }, true)
    .loadConfig({
      root: __dirname
    })
    .stub(process, 'cwd', () => projectPath)
    .stub(TestService.prototype, 'runTestAsynchronous', () => testRunSimple)
    .stdout()
    .stderr()
    .command([
      'force:apex:test:run',
      '--tests',
      'MyApexTests.testMethodOne',
      '--classnames',
      'MyApexTests',
      '--resultformat',
      'human'
    ])
    .it('should throw an error if classnames and tests are specified', ctx => {
      expect(ctx.stderr).to.contain(messages.getMessage('classSuiteTestErr'));
    });

  test
    .withOrg({ username: TEST_USERNAME }, true)
    .loadConfig({
      root: __dirname
    })
    .stub(process, 'cwd', () => projectPath)
    .stub(TestService.prototype, 'runTestAsynchronous', () => testRunSimple)
    .stdout()
    .stderr()
    .command([
      'force:apex:test:run',
      '--tests',
      'MyApexTests.testMethodOne',
      '--suitenames',
      'MyApexSuite',
      '--resultformat',
      'human'
    ])
    .it('should throw an error if suitenames and tests are specified', ctx => {
      expect(ctx.stderr).to.contain(messages.getMessage('classSuiteTestErr'));
    });

  test
    .withOrg({ username: TEST_USERNAME }, true)
    .loadConfig({
      root: __dirname
    })
    .stub(process, 'cwd', () => projectPath)
    .stub(TestService.prototype, 'runTestAsynchronous', () => testRunSimple)
    .stdout()
    .stderr()
    .command([
      'force:apex:test:run',
      '--tests',
      'MyApexTests.testMethodOne',
      '--suitenames',
      'MyApexSuite',
      '--resultformat',
      'human'
    ])
    .it(
      'should throw an error if suitenames and classnames are specified',
      ctx => {
        expect(ctx.stderr).to.contain(messages.getMessage('classSuiteTestErr'));
      }
    );

  test
    .withOrg({ username: TEST_USERNAME }, true)
    .loadConfig({
      root: __dirname
    })
    .stub(process, 'cwd', () => projectPath)
    .stub(TestService.prototype, 'runTestAsynchronous', () => testRunSimple)
    .stdout()
    .stderr()
    .command([
      'force:apex:test:run',
      '--tests',
      'MyApexTests.testMethodOne',
      '-c'
    ])
    .it(
      'should throw an error if code coverage is specified but reporter is missing',
      ctx => {
        expect(ctx.stderr).to.contain(
          messages.getMessage('missingReporterErr')
        );
      }
    );

  test
    .withOrg({ username: TEST_USERNAME }, true)
    .loadConfig({
      root: __dirname
    })
    .stub(process, 'cwd', () => projectPath)
    .stub(TestService.prototype, 'runTestSynchronous', () => testRunSimple)
    .stdout()
    .stderr()
    .command([
      'force:apex:test:run',
      '--suitenames',
      'MyApexSuite',
      '--synchronous'
    ])
    .it(
      'should throw an error if suitenames is specifed with sync run',
      ctx => {
        expect(ctx.stderr).to.contain(messages.getMessage('syncClassErr'));
      }
    );

  test
    .withOrg({ username: TEST_USERNAME }, true)
    .loadConfig({
      root: __dirname
    })
    .stub(process, 'cwd', () => projectPath)
    .stub(TestService.prototype, 'runTestSynchronous', () => testRunSimple)
    .stdout()
    .stderr()
    .command([
      'force:apex:test:run',
      '--classnames',
      'MyApexClass,MySecondClass',
      '--synchronous'
    ])
    .it(
      'should throw an error if multiple classnames are specifed with sync run',
      ctx => {
        expect(ctx.stderr).to.contain(messages.getMessage('syncClassErr'));
      }
    );

  test
    .withOrg({ username: TEST_USERNAME }, true)
    .loadConfig({
      root: __dirname
    })
    .stub(process, 'cwd', () => projectPath)
    .stub(TestService.prototype, 'runTestSynchronous', () => testRunSimple)
    .stdout()
    .stderr()
    .command([
      'force:apex:test:run',
      '--suitenames',
      'MyApexSuite',
      '--testlevel',
      'RunLocalTests'
    ])
    .it(
      'should throw an error if test level is not "Run Specified Tests" for run with suites',
      ctx => {
        expect(ctx.stderr).to.contain(messages.getMessage('testLevelErr'));
      }
    );

  test
    .withOrg({ username: TEST_USERNAME }, true)
    .loadConfig({
      root: __dirname
    })
    .stub(process, 'cwd', () => projectPath)
    .stub(TestService.prototype, 'runTestSynchronous', () => testRunSimple)
    .stdout()
    .stderr()
    .command([
      'force:apex:test:run',
      '--classnames',
      'MyApexClass',
      '--synchronous',
      '--testlevel',
      'RunAllTestsInOrg'
    ])
    .it(
      'should throw an error if test level is not "Run Specified Tests" for run with classnames',
      ctx => {
        expect(ctx.stderr).to.contain(messages.getMessage('testLevelErr'));
      }
    );

  test
    .withOrg({ username: TEST_USERNAME }, true)
    .loadConfig({
      root: __dirname
    })
    .stub(process, 'cwd', () => projectPath)
    .stub(TestService.prototype, 'runTestSynchronous', () => testRunSimple)
    .stdout()
    .stderr()
    .command([
      'force:apex:test:run',
      '--tests',
      'MyApexClass.testInsertTrigger',
      '--synchronous',
      '--testlevel',
      'RunAllTestsInOrg'
    ])
    .it(
      'should throw an error if test level is not "Run Specified Tests" for run with tests',
      ctx => {
        expect(ctx.stderr).to.contain(messages.getMessage('testLevelErr'));
      }
    );

  test
    .withOrg({ username: TEST_USERNAME }, true)
    .loadConfig({
      root: __dirname
    })
    .stub(process, 'cwd', () => projectPath)
    .stub(TestService.prototype, 'runTestSynchronous', () => testRunSimple)
    .stdout()
    .stderr()
    .command([
      'force:apex:test:run',
      '--tests',
      'MyApexClass.testInsertTrigger,MySecondClass.testAfterTrigger',
      '--synchronous'
    ])
    .it(
      'should throw an error if test level is not "Run Specified Tests" for run with tests',
      ctx => {
        expect(ctx.stderr).to.contain(messages.getMessage('syncClassErr'));
      }
    );
});