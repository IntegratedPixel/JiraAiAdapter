import { Command } from 'commander';
import inquirer from 'inquirer';
import { ConfigManager } from '../config/config-manager.js';
import { CoreClient } from '../clients/core.js';
import { Logger } from '../utils/logger.js';
import { ErrorHandler } from '../utils/error-handler.js';

export function createDeleteCommand(): Command {
  const deleteCmd = new Command('delete')
    .description('Delete a Jira issue')
    .argument('<issueKey>', 'Issue key to delete (e.g., PROJ-123)')
    .option('-f, --force', 'Skip confirmation prompt')
    .action(async (issueKey, options) => {
      try {
        const configManager = new ConfigManager();
        await configManager.loadTokenFromKeychain();
        const config = await configManager.getConfig();
        const client = new CoreClient(config);

        // Get issue details first to show what we're deleting
        let issue;
        try {
          issue = await client.getIssue(issueKey);
        } catch (error) {
          Logger.error(`Issue ${issueKey} not found or not accessible`);
          process.exit(4);
        }

        // Confirm deletion unless --force is used
        if (!options.force) {
          Logger.info(`\nAbout to delete:`);
          Logger.info(`  Key: ${issue.key}`);
          Logger.info(`  Summary: ${issue.fields.summary}`);
          Logger.info(`  Type: ${issue.fields.issuetype.name}`);
          Logger.info(`  Status: ${issue.fields.status.name}`);
          
          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Are you sure you want to delete ${issueKey}?`,
              default: false,
            },
          ]);

          if (!confirm) {
            Logger.info('Deletion cancelled');
            return;
          }
        }

        // Delete the issue
        Logger.startSpinner(`Deleting ${issueKey}...`);
        await client.deleteIssue(issueKey);
        Logger.stopSpinner(true, `Successfully deleted ${issueKey}`);

        if (Logger.isJsonMode()) {
          ErrorHandler.success({
            deleted: issueKey,
            summary: issue.fields.summary,
          });
        }
      } catch (error) {
        ErrorHandler.handle(error);
      }
    });

  return deleteCmd;
}