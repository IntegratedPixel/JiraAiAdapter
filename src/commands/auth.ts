import { Command } from 'commander';
import inquirer from 'inquirer';
import { ConfigManager } from '../config/jira.js';
import { CoreClient } from '../clients/core.js';
import { Logger } from '../utils/logger.js';
import { ErrorHandler } from '../utils/error-handler.js';

export function createAuthCommand(): Command {
  const auth = new Command('auth')
    .description('Manage Jira authentication');

  auth
    .command('set')
    .description('Set or update Jira credentials')
    .action(async () => {
      try {
        const configManager = new ConfigManager();
        const currentConfig = configManager.getPartialConfig();

        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'host',
            message: 'Jira host (e.g., yourcompany.atlassian.net):',
            default: currentConfig.host,
            validate: (input) => input.length > 0 || 'Host is required',
          },
          {
            type: 'input',
            name: 'email',
            message: 'Email address:',
            default: currentConfig.email,
            validate: (input) => input.includes('@') || 'Valid email is required',
          },
          {
            type: 'password',
            name: 'apiToken',
            message: 'API token (not password):',
            validate: (input) => input.length > 0 || 'API token is required',
          },
          {
            type: 'input',
            name: 'project',
            message: 'Default project key (e.g., PROJ):',
            default: currentConfig.project,
            validate: (input) => input.length > 0 || 'Project key is required',
          },
        ]);

        // Store token in keychain
        Logger.startSpinner('Storing credentials securely...');
        await configManager.setToken(answers.email, answers.apiToken);
        Logger.stopSpinner(true, 'Credentials stored securely');

        // Test connection
        Logger.startSpinner('Testing connection...');
        const client = new CoreClient({
          host: answers.host,
          email: answers.email,
          apiToken: answers.apiToken,
          project: answers.project,
        });

        const user = await client.testConnection();
        Logger.stopSpinner(true, `Connected as ${user.displayName}`);

        Logger.success('Authentication configured successfully!');
        Logger.info(`\nCreate a .jirarc.json file with:\n${JSON.stringify({
          host: answers.host,
          email: answers.email,
          project: answers.project,
        }, null, 2)}`);

      } catch (error) {
        ErrorHandler.handle(error);
      }
    });

  auth
    .command('test')
    .description('Test Jira connection')
    .action(async () => {
      try {
        const configManager = new ConfigManager();
        const config = await configManager.getConfig();

        Logger.startSpinner('Testing connection...');
        const client = new CoreClient(config);
        const user = await client.testConnection();
        
        Logger.stopSpinner(true, `Connected as ${user.displayName}`);
        
        const project = await client.getProject(config.project);
        Logger.success(`Project: ${project.name} (${project.key})`);

        if (Logger.isJsonMode()) {
          ErrorHandler.success({
            user: {
              displayName: user.displayName,
              email: user.emailAddress,
            },
            project: {
              key: project.key,
              name: project.name,
            },
          });
        }
      } catch (error) {
        ErrorHandler.handle(error);
      }
    });

  auth
    .command('clear')
    .description('Clear stored credentials')
    .action(async () => {
      try {
        const configManager = new ConfigManager();
        const config = configManager.getPartialConfig();

        if (config.email) {
          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Clear stored credentials for ${config.email}?`,
              default: false,
            },
          ]);

          if (confirm) {
            await configManager.deleteToken(config.email);
            Logger.success('Credentials cleared');
          }
        } else {
          Logger.warning('No credentials found to clear');
        }
      } catch (error) {
        ErrorHandler.handle(error);
      }
    });

  return auth;
}