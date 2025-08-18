#!/usr/bin/env node

import { Command } from 'commander';
import { createAuthCommand } from './commands/auth.js';
import { createInitCommand } from './commands/init.js';
import { createListCommand } from './commands/list.js';
import { createViewCommand } from './commands/view.js';
import { createCreateCommand } from './commands/create.js';
import { createDeleteCommand } from './commands/delete.js';
import { Logger } from './utils/logger.js';
import { ErrorHandler } from './utils/error-handler.js';
import { ConfigManager } from './config/jira.js';

// Export for programmatic usage
export { CoreClient } from './clients/core.js';
export { ConfigManager } from './config/jira.js';
export { Logger } from './utils/logger.js';
export { ErrorHandler } from './utils/error-handler.js';
export { ADFBuilder } from './utils/adf.js';
export type { JiraConfig, GlobalConfig, ProjectConfig } from './config/jira.js';
export type { JiraIssue, JiraUser, JiraComment } from './types/jira.js';

// Version will be injected during build
const VERSION = '0.4.0';

const program = new Command();

program
  .name('jira')
  .description('AI-friendly Jira CLI tool for command-line interaction with Jira')
  .version(VERSION)
  .option('-d, --debug', 'Enable debug mode')
  .option('-q, --quiet', 'Suppress non-error output')
  .option('--json', 'Output in JSON format')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts();
    Logger.setDebugMode(opts.debug || false);
    Logger.setQuietMode(opts.quiet || false);
    Logger.setJsonMode(opts.json || false);
  });

// Add commands
program.addCommand(createAuthCommand());
program.addCommand(createInitCommand());
program.addCommand(createListCommand());
program.addCommand(createViewCommand());
program.addCommand(createCreateCommand());
program.addCommand(createDeleteCommand());

// Add help command that shows configuration status
program
  .command('status')
  .description('Show configuration status')
  .action(async () => {
    try {
      const configManager = new ConfigManager();
      const config = configManager.getPartialConfig();
      
      Logger.info('Configuration Status:');
      Logger.info(`  Host: ${config.host || 'Not configured'}`);
      Logger.info(`  Email: ${config.email || 'Not configured'}`);
      Logger.info(`  API Token: ${config.apiToken ? '***' : 'Not configured'}`);
      Logger.info(`  Project: ${config.project || 'Not configured'}`);
      Logger.info(`  Board: ${config.board || 'Not configured'}`);
      
      if (await configManager.isConfigured()) {
        Logger.success('\nConfiguration is complete!');
      } else {
        const errors = configManager.validate();
        Logger.warning('\nConfiguration incomplete:');
        errors.forEach(error => Logger.error(error));
        Logger.info('\nRun "jira auth set" to configure');
      }
    } catch (error) {
      ErrorHandler.handle(error);
    }
  });

// Error handling for unknown commands
program.on('command:*', () => {
  Logger.error(`Invalid command: ${program.args.join(' ')}`);
  Logger.info('Run "jira --help" for a list of available commands');
  process.exit(1);
});

// Parse arguments
try {
  program.parse(process.argv);
  
  // Show help if no command provided
  if (!process.argv.slice(2).length) {
    program.outputHelp();
  }
} catch (error) {
  ErrorHandler.handle(error);
}