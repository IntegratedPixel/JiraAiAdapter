import { Command } from 'commander';
import { ConfigManager } from '../config/jira.js';
import { CoreClient } from '../clients/core.js';
import { Logger } from '../utils/logger.js';
import { ErrorHandler } from '../utils/error-handler.js';
import { Formatter } from '../utils/formatter.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export function createViewCommand(): Command {
  const view = new Command('view')
    .description('View issue details')
    .argument('<issueKey>', 'Issue key (e.g., PROJ-123)')
    .option('-c, --comments', 'Include comments')
    .option('-h, --history', 'Include history')
    .option('--adf', 'Show description in raw ADF format')
    .option('--open', 'Open issue in browser')
    .action(async (issueKey, options) => {
      try {
        const configManager = new ConfigManager();
        const config = await configManager.getConfig();
        const client = new CoreClient(config);

        Logger.startSpinner(`Fetching ${issueKey}...`);

        // Build expand options
        const expand: string[] = [];
        if (options.comments) {
          expand.push('comments');
        }
        if (options.history) {
          expand.push('changelog');
        }

        const issue = await client.getIssue(issueKey, expand);
        
        Logger.stopSpinner(true);

        // Open in browser if requested
        if (options.open) {
          const url = `https://${config.host}/browse/${issueKey}`;
          Logger.info(`Opening ${url} in browser...`);
          
          try {
            const platform = process.platform;
            const command = platform === 'darwin' ? 'open' : 
                          platform === 'win32' ? 'start' : 'xdg-open';
            await execAsync(`${command} "${url}"`);
          } catch (error) {
            Logger.warning('Could not open browser automatically');
            Logger.info(`URL: ${url}`);
          }
        }

        if (Logger.isJsonMode()) {
          const jsonData: any = Formatter.formatJson(issue);
          
          if (options.comments && issue.fields.comment) {
            jsonData.comments = issue.fields.comment.comments.map((c: any) => ({
              author: c.author?.displayName,
              created: c.created,
              body: Formatter.formatDescription(c.body),
            }));
          }
          
          ErrorHandler.success(jsonData);
        } else {
          // Display issue details
          console.log(Formatter.formatIssueDetail(issue));

          // Display comments if requested
          if (options.comments) {
            console.log('');
            console.log('Comments:');
            if (issue.fields.comment && issue.fields.comment.comments.length > 0) {
              console.log(Formatter.formatComments(issue.fields.comment.comments));
            } else {
              console.log('No comments');
            }
          }

          // Display raw ADF if requested
          if (options.adf && issue.fields.description) {
            console.log('');
            console.log('Raw ADF Description:');
            console.log(JSON.stringify(issue.fields.description, null, 2));
          }

          // Show issue URL
          console.log('');
          console.log(`URL: https://${config.host}/browse/${issueKey}`);
        }
      } catch (error) {
        ErrorHandler.handle(error);
      }
    });

  return view;
}