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
    .description('View detailed information about a Jira issue including summary, description, Epic links, comments, history, and all metadata. Supports opening in browser.')
    .argument('<issueKey>', 'Issue key (e.g., PROJ-123)')
    .option('-c, --comments', 'Include comments')
    .option('-h, --history', 'Include history')
    .option('--adf', 'Show description in raw ADF format')
    .option('--open', 'Open issue in browser')
    .option('--project <key>', 'Specify project context (overrides default)')
    .option('--board <name>', 'Specify board name (overrides default board)')
    .action(async (issueKey, options) => {
      try {
        const configManager = new ConfigManager();
        // Apply command-line project overrides
        const configOverrides = {
          project: options.project,
          board: options.board,
        };
        const config = await configManager.getConfig(configOverrides);
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

        let issue;
        try {
          issue = await client.getIssue(issueKey, expand);
        } catch (error: any) {
          // Provide more helpful error message for 404s
          if (error.response?.statusCode === 404) {
            Logger.stopSpinner(false);
            const url = `https://${config.host}/browse/${issueKey}`;
            
            if (Logger.isJsonMode()) {
              ErrorHandler.handle(error);
            } else {
              Logger.error(`Issue ${issueKey} not found or you don't have permission to view it.`);
              Logger.info('\nPossible reasons:');
              Logger.info('- The issue key might be incorrect');
              Logger.info('- The issue might have been deleted');
              Logger.info('- You might not have permission to view issues in this project');
              Logger.info(`\nYou can try visiting the URL directly: ${url}`);
              process.exit(4);
            }
          }
          throw error;
        }
        
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