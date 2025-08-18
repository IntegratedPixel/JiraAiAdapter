import { Command } from 'commander';
import inquirer from 'inquirer';
import { ConfigManager, GlobalConfig } from '../config/config-manager.js';
import { CoreClient } from '../clients/core.js';
import { Logger } from '../utils/logger.js';
import { ErrorHandler } from '../utils/error-handler.js';

export function createAuthCommand(): Command {
  const auth = new Command('auth')
    .description('Manage Jira authentication (global settings)');

  auth
    .command('set')
    .description('Set or update global Jira credentials')
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
        ]);

        // Save global configuration
        const globalConfig: GlobalConfig = {
          host: answers.host,
          email: answers.email,
          apiToken: answers.apiToken,
        };

        Logger.startSpinner('Storing credentials securely...');
        await configManager.saveGlobalConfig(globalConfig);
        Logger.stopSpinner(true, 'Credentials stored securely');

        // Test connection
        Logger.startSpinner('Testing connection...');
        const client = new CoreClient({
          host: answers.host,
          email: answers.email,
          apiToken: answers.apiToken,
          project: 'TEST', // Dummy project for connection test
        });

        const user = await client.testConnection();
        Logger.stopSpinner(true, `Connected as ${user.displayName}`);

        Logger.success('✅ Global authentication configured successfully!');
        Logger.info('\nCredentials saved to ~/.jirarc.json (host & email only)');
        Logger.info('API token stored securely in system keychain');
        Logger.info('\n💡 Next step: Run "jira init" in your project directory to configure project-specific settings');

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
        
        // Check global auth
        const globalErrors = configManager.validateGlobal();
        if (globalErrors.length > 0) {
          Logger.error('Global authentication not configured:');
          globalErrors.forEach(err => Logger.error(`  • ${err}`));
          Logger.info('\nRun "jira auth set" to configure');
          process.exit(3);
        }

        const config = await configManager.getConfig();

        Logger.startSpinner('Testing connection...');
        const client = new CoreClient(config);
        const user = await client.testConnection();
        
        Logger.stopSpinner(true, `Connected as ${user.displayName}`);
        
        // Try to get project info if configured
        if (config.project) {
          try {
            const project = await client.getProject(config.project);
            Logger.success(`Project: ${project.name} (${project.key})`);
          } catch {
            Logger.warning(`Project ${config.project} not accessible or doesn't exist`);
          }
        } else {
          Logger.info('No project configured for current directory');
          Logger.info('Run "jira init" to configure project settings');
        }

        if (Logger.isJsonMode()) {
          ErrorHandler.success({
            user: {
              displayName: user.displayName,
              email: user.emailAddress,
            },
            project: config.project || null,
            host: config.host,
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
        
        if (!config.email) {
          Logger.warning('No credentials to clear');
          return;
        }

        const confirm = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: `Clear credentials for ${config.email}?`,
            default: false,
          },
        ]);

        if (confirm.confirm) {
          await configManager.deleteToken(config.email);
          Logger.success('Credentials cleared from keychain');
          Logger.info('Note: You may need to manually remove ~/.jirarc.json');
        }
      } catch (error) {
        ErrorHandler.handle(error);
      }
    });

  auth
    .command('status')
    .description('Show current authentication status')
    .action(async () => {
      try {
        const configManager = new ConfigManager();
        const sources = configManager.getConfigSource();
        const config = configManager.getPartialConfig();
        
        Logger.info('🔐 Authentication Status:\n');
        
        Logger.info('Global Configuration:');
        Logger.info(`  Config file: ${sources.global}`);
        Logger.info(`  Host: ${config.host || 'Not configured'}`);
        Logger.info(`  Email: ${config.email || 'Not configured'}`);
        Logger.info(`  API Token: ${config.apiToken ? '***' : 'Not configured'}`);
        
        if (sources.project) {
          Logger.info('\nProject Configuration:');
          Logger.info(`  Config file: ${sources.project}`);
          Logger.info(`  Project: ${config.project || 'Not configured'}`);
          if (config.board) {
            Logger.info(`  Board: ${config.board}`);
          }
          if (config.defaultIssueType) {
            Logger.info(`  Default Type: ${config.defaultIssueType}`);
          }
        } else {
          Logger.info('\nNo project configuration found in current directory');
          Logger.info('Run "jira init" to create one');
        }

        // Validate
        await configManager.loadTokenFromKeychain();
        const globalErrors = configManager.validateGlobal();
        const projectErrors = configManager.validateProject();

        if (globalErrors.length === 0) {
          Logger.success('\n✅ Global authentication is configured');
        } else {
          Logger.error('\n❌ Global authentication issues:');
          globalErrors.forEach(err => Logger.error(`  • ${err}`));
        }

        if (sources.project && projectErrors.length === 0) {
          Logger.success('✅ Project is configured');
        } else if (sources.project) {
          Logger.error('❌ Project configuration issues:');
          projectErrors.forEach(err => Logger.error(`  • ${err}`));
        }
      } catch (error) {
        ErrorHandler.handle(error);
      }
    });

  return auth;
}