import { Command } from 'commander';
import { ConfigManager } from '../config/jira.js';
import { CoreClient } from '../clients/core.js';
import { Logger } from '../utils/logger.js';
import { ErrorHandler } from '../utils/error-handler.js';
import Table from 'cli-table3';

export function createTypesCommand(): Command {
  const types = new Command('types')
    .description('List available issue types for the current project')
    .option('-p, --project <key>', 'Project key (defaults to configured project)')
    .option('--all', 'Show all fields including IDs and descriptions')
    .action(async (options) => {
      try {
        const configManager = new ConfigManager();
        const config = await configManager.getConfig();
        const client = new CoreClient(config);

        const projectKey = options.project || config.project;
        
        Logger.startSpinner(`Fetching issue types for project ${projectKey}...`);

        // Get issue types from create metadata
        const issueTypes = await client.getProjectIssueTypes(projectKey);
        
        Logger.stopSpinner(true);

        if (!issueTypes || issueTypes.length === 0) {
          Logger.warning('No issue types found for this project');
          return;
        }

        if (Logger.isJsonMode()) {
          ErrorHandler.success({
            project: projectKey,
            issueTypes: issueTypes.map(type => ({
              id: type.id,
              name: type.name,
              subtask: type.subtask,
              description: type.description,
            })),
          });
          return;
        }

        // Display as table
        const table = new Table({
          head: options.all 
            ? ['Name', 'ID', 'Subtask', 'Description']
            : ['Name', 'Type', 'Can be used with --parent'],
          style: { head: ['cyan'] },
          colWidths: options.all ? [25, 10, 10, 50] : [30, 15, 25],
          wordWrap: true,
        });

        // Sort: subtasks first, then alphabetically
        const sorted = issueTypes.sort((a, b) => {
          if (a.subtask && !b.subtask) return -1;
          if (!a.subtask && b.subtask) return 1;
          return a.name.localeCompare(b.name);
        });

        sorted.forEach(type => {
          if (options.all) {
            table.push([
              type.name,
              type.id,
              type.subtask ? '✓' : '✗',
              type.description || '',
            ]);
          } else {
            table.push([
              type.name,
              type.subtask ? 'Sub-task' : 'Standard',
              type.subtask ? '✓ Yes' : '✗ No (create separately)',
            ]);
          }
        });

        console.log(`\nIssue Types for Project: ${projectKey}\n`);
        console.log(table.toString());

        // Add helpful notes
        const subtaskTypes = issueTypes.filter(t => t.subtask);
        if (subtaskTypes.length > 0) {
          console.log('\n💡 Sub-task types found:');
          subtaskTypes.forEach(type => {
            console.log(`   - "${type.name}" (use with --parent option)`);
          });
          console.log('\nExample usage:');
          console.log(`   jira create --type "${subtaskTypes[0].name}" --summary "..." --parent PROJ-123`);
        } else {
          Logger.warning('\n⚠️  No sub-task types found in this project.');
          Logger.info('Sub-tasks may not be enabled for this project.');
        }

      } catch (error) {
        ErrorHandler.handle(error);
      }
    });

  return types;
}