/*
 * Copyright (c) 2020, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
import { ApexExecuteOptions, ExecuteService, ExecuteAnonymousResponse } from '@salesforce/apex-node';
import { flags, SfdxCommand } from '@salesforce/command';
import { Messages, SfError } from '@salesforce/core';
import { AnyJson } from '@salesforce/ts-types';
import { buildDescription, colorSuccess, colorError, logLevels } from '../../../utils';

Messages.importMessagesDirectory(__dirname);
const messages = Messages.load('@salesforce/plugin-apex', 'execute', [
  'apexCodeFileDescription',
  'commandDescription',
  'executeCompileSuccess',
  'executeCompileFailure',
  'executeRuntimeSuccess',
  'executeRuntimeFailure',
  'logLevelDescription',
  'logLevelLongDescription',
  'longDescription',
]);

export default class Execute extends SfdxCommand {
  public static description = buildDescription(
    messages.getMessage('commandDescription'),
    messages.getMessage('longDescription')
  );
  public static longDescription = messages.getMessage('longDescription');

  public static examples = [
    '$ sfdx force:apex:execute -u testusername@salesforce.org -f ~/test.apex',
    '$ sfdx force:apex:execute -f ~/test.apex',
    '$ sfdx force:apex:execute \nStart typing Apex code. Press the Enter key after each line, then press CTRL+D when finished.',
  ];
  protected static requiresUsername = true;

  public static readonly flagsConfig = {
    apexcodefile: flags.filepath({
      char: 'f',
      description: messages.getMessage('apexCodeFileDescription'),
    }),
    loglevel: flags.enum({
      description: messages.getMessage('logLevelDescription'),
      longDescription: messages.getMessage('logLevelLongDescription'),
      default: 'warn',
      options: logLevels,
    }),
    apiversion: flags.builtin(),
  };

  public async run(): Promise<AnyJson> {
    try {
      // org is guaranteed by requiresUsername field
      if (!this.org) {
        throw Error('Unable to get connection from Org.');
      }
      const conn = this.org.getConnection();
      const exec = new ExecuteService(conn);

      const execAnonOptions: ApexExecuteOptions = {
        ...(this.flags.apexcodefile ? { apexFilePath: this.flags.apexcodefile } : { userInput: true }),
      };

      const result = await exec.executeAnonymous(execAnonOptions);
      const formattedResult = this.formatJson(result);
      this.ux.log(this.formatDefault(result));
      if (!result.compiled || !result.success) {
        let err: SfError;
        if (!result.compiled) {
          err = new SfError(messages.getMessage('executeCompileFailure'), 'executeCompileFailure');
        } else {
          err = new SfError(messages.getMessage('executeRuntimeFailure'), 'executeRuntimeFailure');
        }
        err.setData(formattedResult);
        throw err;
      }
      return formattedResult;
    } catch (e) {
      return Promise.reject(e);
    }
  }

  private formatDefault(response: ExecuteAnonymousResponse): string {
    let outputText = '';
    if (response.success) {
      outputText += `${colorSuccess(messages.getMessage('executeCompileSuccess'))}\n`;
      outputText += `${colorSuccess(messages.getMessage('executeRuntimeSuccess'))}\n`;
      outputText += `\n${response.logs}`;
    } else {
      if (!response.diagnostic) {
        throw Error('No diagnostic property found on response.');
      }
      const diagnostic = response.diagnostic[0];

      if (!response.compiled) {
        outputText += colorError(`Error: Line: ${diagnostic.lineNumber}, Column: ${diagnostic.columnNumber}\n`);
        outputText += colorError(`Error: ${diagnostic.compileProblem}\n`);
      } else {
        outputText += `${colorSuccess(messages.getMessage('executeCompileSuccess'))}\n`;
        outputText += colorError(`Error: ${diagnostic.exceptionMessage}\n`);
        outputText += colorError(`Error: ${diagnostic.exceptionStackTrace}\n`);
        outputText += `\n${response.logs}`;
      }
    }
    return outputText;
  }

  private formatJson(response: ExecuteAnonymousResponse): AnyJson {
    const diagnostic = typeof response.diagnostic !== 'undefined';

    // Allow assumption below that diagnostic array is populated.
    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    const formattedResponse = {
      success: response.success,
      compiled: response.compiled,
      compileProblem: diagnostic ? response.diagnostic![0].compileProblem : '',
      exceptionMessage: diagnostic ? response.diagnostic![0].exceptionMessage : '',
      exceptionStackTrace: diagnostic ? response.diagnostic![0].exceptionStackTrace : '',
      line: diagnostic ? response.diagnostic![0].lineNumber : -1,
      column: diagnostic ? response.diagnostic![0].columnNumber : -1,
      logs: response.logs,
    };
    /* eslint-emable @typescript-eslint/no-non-null-assertion */
    return formattedResponse;
  }
}
