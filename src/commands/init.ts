import { Command } from 'commander';
import inquirer from 'inquirer';
import { ConfigManager, ProjectConfig } from '../config/config-manager.js';
import { Logger } from '../utils/logger.js';
import { ErrorHandler } from '../utils/error-handler.js';
import { CoreClient } from '../clients/core.js';

export function createInitCommand(): Command {
  const init = new Command('init')
    .description('Initialize Jira configuration for current project')
    .option('-p, --project <key>', 'Project key (e.g., PROJ)')
    .option('-b, --board <name>', 'Board name or ID')
    .option('--assignee <user>', 'Default assignee (email or "me")')
    .option('--labels <labels>', 'Default labels (comma-separated)')
    .option('--type <type>', 'Default issue type', 'Task')
    .option('--priority <priority>', 'Default priority', 'Medium')
    .option('--non-interactive', 'Skip interactive prompts')
    .action(async (options) => {
      try {
        const configManager = new ConfigManager();
        
        // Check if global auth is configured
        const globalErrors = configManager.validateGlobal();
        if (globalErrors.length > 0) {
          Logger.error('Global authentication not configured. Run "jira auth set" first.');
          globalErrors.forEach(err => Logger.error(`  • ${err}`));
          process.exit(3);
        }

        let projectConfig: ProjectConfig;

        if (options.nonInteractive) {
          // Use provided options
          if (!options.project) {
            throw new Error('--project is required in non-interactive mode');
          }

          projectConfig = {
            project: options.project,
            board: options.board,
            defaultIssueType: options.type,
            defaultAssignee: options.assignee,
            defaultLabels: options.labels ? options.labels.split(',').map((l: string) => l.trim()) : undefined,
            defaultPriority: options.priority,
          };
        } else {
          // Interactive mode
          const currentConfig = configManager.getPartialConfig();
          const config = await configManager.getConfig();
          
          // Get available projects if possible
          let projectChoices: any[] = [];
          try {
            Logger.startSpinner('Fetching available projects...');
            const client = new CoreClient(config);
            const projects = await client.getProjects();
            Logger.stopSpinner(true);
            
            projectChoices = projects.map(p => ({
              name: `${p.key} - ${p.name}`,
              value: p.key,
            }));
          } catch {
            Logger.stopSpinner(false);
            // Couldn't fetch projects, will use text input
          }

          const questions: any[] = [
            {
              type: projectChoices.length > 0 ? 'list' : 'input',
              name: 'project',
              message: 'Project key:',
              default: currentConfig.project || options.project,
              choices: projectChoices.length > 0 ? projectChoices : undefined,
              validate: (input: string) => {
                if (!input || input.trim().length === 0) {
                  return 'Project key is required';
                }
                return true;
              },
            },
            {
              type: 'input',
              name: 'board',
              message: 'Board name or ID (optional):',
              default: currentConfig.board || options.board,
            },
            {
              type: 'list',
              name: 'defaultIssueType',
              message: 'Default issue type:',
              choices: ['Task', 'Bug', 'Story', 'Epic', 'Sub-task'],
              default: currentConfig.defaultIssueType || options.type || 'Task',
            },
            {
              type: 'input',
              name: 'defaultAssignee',
              message: 'Default assignee (email or "me", optional):',
              default: currentConfig.defaultAssignee || options.assignee,
            },
            {
              type: 'input',
              name: 'defaultLabels',
              message: 'Default labels (comma-separated, optional):',
              default: currentConfig.defaultLabels?.join(', ') || options.labels,
            },
            {
              type: 'list',
              name: 'defaultPriority',
              message: 'Default priority:',
              choices: ['Highest', 'High', 'Medium', 'Low', 'Lowest'],
              default: currentConfig.defaultPriority || options.priority || 'Medium',
            },
          ];

          const answers = await inquirer.prompt(questions);

          projectConfig = {
            project: answers.project.split(' - ')[0], // Extract just the key if user selected from list
            board: answers.board || undefined,
            defaultIssueType: answers.defaultIssueType,
            defaultAssignee: answers.defaultAssignee || undefined,
            defaultLabels: answers.defaultLabels 
              ? answers.defaultLabels.split(',').map((l: string) => l.trim()).filter(Boolean)
              : undefined,
            defaultPriority: answers.defaultPriority,
          };
        }

        // Save project configuration
        await configManager.saveProjectConfig(projectConfig);

        const configSource = configManager.getConfigSource();
        
        if (Logger.isJsonMode()) {
          ErrorHandler.success({
            message: 'Project configuration initialized',
            config: projectConfig,
            configFile: configSource.project,
          });
        } else {
          Logger.success('✅ Project configuration saved to .jirarc.json');
          Logger.info('\nProject Configuration:');
          Logger.info(`  Project: ${projectConfig.project}`);
          if (projectConfig.board) {
            Logger.info(`  Board: ${projectConfig.board}`);
          }
          Logger.info(`  Default Type: ${projectConfig.defaultIssueType}`);
          if (projectConfig.defaultAssignee) {
            Logger.info(`  Default Assignee: ${projectConfig.defaultAssignee}`);
          }
          if (projectConfig.defaultLabels && projectConfig.defaultLabels.length > 0) {
            Logger.info(`  Default Labels: ${projectConfig.defaultLabels.join(', ')}`);
          }
          Logger.info(`  Default Priority: ${projectConfig.defaultPriority}`);
          
          Logger.info('\n💡 Tip: Add .jirarc.json to your .gitignore if it contains sensitive data');
        }
      } catch (error) {
        ErrorHandler.handle(error);
      }
    });

  return init;
}