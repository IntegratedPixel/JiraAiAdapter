#!/usr/bin/env node

import { Command } from 'commander';
import { createAuthCommand } from './commands/auth.js';
import { Logger } from './utils/logger.js';
import { ErrorHandler } from './utils/error-handler.js';
import { ConfigManager } from './config/jira.js';
// Version will be injected during build
const VERSION = '0.1.0';

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

// Add auth command
program.addCommand(createAuthCommand());

// Add placeholder commands for Phase 2
program
  .command('list')
  .description('List Jira issues (coming in Phase 2)')
  .action(() => {
    Logger.info('This command will be implemented in Phase 2');
  });

program
  .command('view <issueKey>')
  .description('View issue details (coming in Phase 2)')
  .action(() => {
    Logger.info('This command will be implemented in Phase 2');
  });

program
  .command('create')
  .description('Create a new issue (coming in Phase 2)')
  .action(() => {
    Logger.info('This command will be implemented in Phase 2');
  });

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