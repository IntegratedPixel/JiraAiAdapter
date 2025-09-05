import { Command } from 'commander';
import inquirer from 'inquirer';
import { ConfigManager } from '../config/jira.js';
import { CoreClient } from '../clients/core.js';
import { Logger } from '../utils/logger.js';
import { ErrorHandler } from '../utils/error-handler.js';
import Table from 'cli-table3';

export function createLinkCommand(): Command {
  const link = new Command('link')
    .description('Create, list, or delete issue links')
    .option('--project <key>', 'Project key (overrides default project)')
    .option('--board <name>', 'Specify board name (overrides default board)')
    .action(async () => {
      // Show help if no arguments provided
      link.help();
    });

  // Create a link between two issues
  link.command('create')
    .alias('add')
    .description('Create a link between two issues')
    .argument('<from>', 'Source issue key (e.g., PROJ-123)')
    .argument('<to>', 'Target issue key (e.g., PROJ-456)')
    .option('-t, --type <type>', 'Link type (e.g., blocks, relates, duplicates)', 'Relates')
    .option('-c, --comment <comment>', 'Add a comment to the link')
    .action(async (fromIssue, toIssue, options) => {
      try {
        const configManager = new ConfigManager();
        const config = await configManager.getConfig({
          project: options.project,
          board: options.board,
        });
        const client = new CoreClient(config);

        Logger.startSpinner(`Creating ${options.type} link from ${fromIssue} to ${toIssue}...`);

        const result = await client.createIssueLink(fromIssue, toIssue, options.type, options.comment);
        
        Logger.stopSpinner(true);

        if (Logger.isJsonMode()) {
          ErrorHandler.success({
            action: 'link_created',
            from: fromIssue,
            to: toIssue,
            type: options.type,
            comment: options.comment || null,
            commentWarning: result.commentWarning || null,
          });
        } else {
          Logger.success(`✅ Created ${options.type} link: ${fromIssue} → ${toIssue}`);
          if (options.comment && !result.commentWarning) {
            Logger.info(`💬 Comment added: "${options.comment}"`);
          } else if (result.commentWarning) {
            Logger.warning(`⚠️  ${result.commentWarning}`);
          }
        }
      } catch (error) {
        ErrorHandler.handle(error);
      }
    });

  // List links for an issue
  link.command('list')
    .alias('ls')
    .description('List all links for an issue')
    .argument('<issue>', 'Issue key to list links for (e.g., PROJ-123)')
    .option('--type <type>', 'Filter by link type')
    .action(async (issueKey, options) => {
      try {
        const configManager = new ConfigManager();
        const config = await configManager.getConfig({
          project: options.project,
          board: options.board,
        });
        const client = new CoreClient(config);

        Logger.startSpinner(`Fetching links for ${issueKey}...`);

        const links = await client.getIssueLinks(issueKey);
        
        Logger.stopSpinner(true);

        // Filter by type if specified
        const filteredLinks = options.type 
          ? links.filter(link => link.type.name.toLowerCase() === options.type.toLowerCase())
          : links;

        if (Logger.isJsonMode()) {
          ErrorHandler.success({
            issue: issueKey,
            linkCount: filteredLinks.length,
            links: filteredLinks.map(link => ({
              id: link.id,
              type: link.type.name,
              direction: link.outwardIssue ? 'outward' : 'inward',
              linkedIssue: {
                key: (link.outwardIssue || link.inwardIssue).key,
                summary: (link.outwardIssue || link.inwardIssue).fields.summary,
                status: (link.outwardIssue || link.inwardIssue).fields.status.name,
              },
              relationship: link.outwardIssue ? link.type.outward : link.type.inward,
            })),
          });
        } else {
          if (filteredLinks.length === 0) {
            Logger.info(`No${options.type ? ` ${options.type}` : ''} links found for ${issueKey}`);
            return;
          }

          console.log(`\\nLinks for ${issueKey}:`);
          
          const table = new Table({
            head: ['Type', 'Relationship', 'Linked Issue', 'Status', 'Summary'],
            style: { head: ['cyan'] },
            colWidths: [15, 20, 15, 15, 50],
            wordWrap: true,
          });

          filteredLinks.forEach(link => {
            const linkedIssue = link.outwardIssue || link.inwardIssue;
            const relationship = link.outwardIssue ? link.type.outward : link.type.inward;
            
            table.push([
              link.type.name,
              relationship,
              linkedIssue.key,
              linkedIssue.fields.status.name,
              linkedIssue.fields.summary.length > 47 
                ? linkedIssue.fields.summary.substring(0, 47) + '...'
                : linkedIssue.fields.summary,
            ]);
          });

          console.log(table.toString());
          Logger.info(`\\nTotal: ${filteredLinks.length} link${filteredLinks.length !== 1 ? 's' : ''}`);
        }
      } catch (error) {
        ErrorHandler.handle(error);
      }
    });

  // Delete a link between two issues
  link.command('delete')
    .alias('remove')
    .alias('rm')
    .description('Delete a link between two issues')
    .argument('<from>', 'First issue key (e.g., PROJ-123)')
    .argument('<to>', 'Second issue key (e.g., PROJ-456)')
    .option('-t, --type <type>', 'Specific link type to delete (if multiple links exist)')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(async (fromIssue, toIssue, options) => {
      try {
        const configManager = new ConfigManager();
        const config = await configManager.getConfig({
          project: options.project,
          board: options.board,
        });
        const client = new CoreClient(config);

        // Confirmation prompt (unless --yes flag)
        const skipConfirmation = options.yes || process.env.JIRA_CLI_YES_MODE === 'true';
        if (!skipConfirmation && !Logger.isJsonMode()) {
          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Delete link between ${fromIssue} and ${toIssue}${options.type ? ` (${options.type})` : ''}?`,
              default: false,
            }
          ]);

          if (!confirm) {
            Logger.info('Link deletion cancelled');
            return;
          }
        }

        Logger.startSpinner(`Deleting link between ${fromIssue} and ${toIssue}...`);

        await client.deleteIssueLink(fromIssue, toIssue, options.type);
        
        Logger.stopSpinner(true);

        if (Logger.isJsonMode()) {
          ErrorHandler.success({
            action: 'link_deleted',
            from: fromIssue,
            to: toIssue,
            type: options.type || null,
          });
        } else {
          Logger.success(`✅ Deleted link between ${fromIssue} and ${toIssue}${options.type ? ` (${options.type})` : ''}`);
        }
      } catch (error) {
        ErrorHandler.handle(error);
      }
    });

  // List available link types
  link.command('types')
    .description('List available issue link types')
    .action(async (options) => {
      try {
        const configManager = new ConfigManager();
        const config = await configManager.getConfig({
          project: options.project,
          board: options.board,
        });
        const client = new CoreClient(config);

        Logger.startSpinner('Fetching available link types...');

        const linkTypes = await client.getIssueLinkTypes();
        
        Logger.stopSpinner(true);

        if (Logger.isJsonMode()) {
          ErrorHandler.success({
            linkTypes: linkTypes.map((type: any) => ({
              name: type.name,
              inward: type.inward,
              outward: type.outward,
            })),
          });
        } else {
          if (linkTypes.length === 0) {
            Logger.warning('No link types found');
            return;
          }

          console.log('\\nAvailable Issue Link Types:\\n');
          
          const table = new Table({
            head: ['Name', 'Inward Description', 'Outward Description'],
            style: { head: ['cyan'] },
            colWidths: [20, 25, 25],
            wordWrap: true,
          });

          linkTypes.forEach((type: any) => {
            table.push([
              type.name,
              type.inward,
              type.outward,
            ]);
          });

          console.log(table.toString());
          
          Logger.info('\\n💡 Usage examples:');
          Logger.info(`   jira link create PROJ-1 PROJ-2 --type "Blocks"`);
          Logger.info(`   jira link create PROJ-1 PROJ-2 --type "Relates" --comment "Related work"`);
        }
      } catch (error) {
        ErrorHandler.handle(error);
      }
    });

  return link;
}