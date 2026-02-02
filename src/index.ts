#!/usr/bin/env node

import { Command } from 'commander';
import { createAuthCommand } from './commands/auth.js';
import { createInitCommand } from './commands/init.js';
import { createListCommand } from './commands/list.js';
import { createViewCommand } from './commands/view.js';
import { createCreateCommand } from './commands/create.js';
import { createUpdateCommand } from './commands/update.js';
import { createDeleteCommand } from './commands/delete.js';
import { createBatchCommand } from './commands/batch.js';
import { createTypesCommand } from './commands/types.js';
import { createCommentCommand } from './commands/comment.js';
import { createTransitionCommand } from './commands/transition.js';
import { createLinkCommand } from './commands/link.js';
import { createSelftestCommand } from './commands/selftest.js';
import { Logger } from './utils/logger.js';
import { ErrorHandler } from './utils/error-handler.js';
import { ConfigManager } from './config/jira.js';

// Export for programmatic usage
export { CoreClient } from './clients/core.js';
export { ConfigManager } from './config/jira.js';
export { Logger } from './utils/logger.js';
export { ErrorHandler } from './utils/error-handler.js';
export { ADFBuilder } from './utils/adf.js';
export { MarkdownParser } from './utils/markdown-parser.js';
export type { ParsedIssue } from './utils/markdown-parser.js';
export type { JiraConfig, GlobalConfig, ProjectConfig } from './config/jira.js';
export type { JiraIssue, JiraUser, JiraComment } from './types/jira.js';

// Version will be injected during build
const VERSION = '0.6.1';

const program = new Command();

program
  .name('jira')
  .description('AI-friendly Jira CLI for creating, updating, viewing, and managing Jira issues. Supports Epic linking, batch operations, issue transitions, comments, and more. Designed for both interactive use and CI/CD automation.')
  .version(VERSION)
  .option('-d, --debug', 'Enable debug mode')
  .option('-q, --quiet', 'Suppress non-error output')
  .option('-y, --yes', 'Automatically answer yes to all prompts')
  .option('--json', 'Output in JSON format')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts();
    Logger.setDebugMode(opts.debug || false);
    Logger.setQuietMode(opts.quiet || false);
    Logger.setJsonMode(opts.json || false);
    
    // Store yes mode globally for commands to access
    process.env.JIRA_CLI_YES_MODE = opts.yes ? 'true' : 'false';
  });

// Add commands
program.addCommand(createAuthCommand());
program.addCommand(createInitCommand());
program.addCommand(createListCommand());
program.addCommand(createViewCommand());
program.addCommand(createCreateCommand());
program.addCommand(createUpdateCommand());
program.addCommand(createDeleteCommand());
program.addCommand(createCommentCommand());
program.addCommand(createTransitionCommand());
program.addCommand(createLinkCommand());
program.addCommand(createBatchCommand());
program.addCommand(createTypesCommand());
program.addCommand(createSelftestCommand());

// Add help command that shows configuration status
program
  .command('status')
  .description('Show configuration status')
  .option('--verbose', 'Show detailed configuration sources')
  .action(async (options) => {
    try {
      const configManager = new ConfigManager();
      const config = configManager.getPartialConfig();
      const status = configManager.getConfigStatus();
      
      Logger.info('Configuration Status:');
      Logger.info(`  Host: ${config.host || 'Not configured'} ${options.verbose ? `(${status.sources.host})` : ''}`);
      Logger.info(`  Email: ${config.email || 'Not configured'} ${options.verbose ? `(${status.sources.email})` : ''}`);
      Logger.info(`  API Token: ${config.apiToken ? '***' : 'Not configured'} ${options.verbose ? `(${status.sources.apiToken})` : ''}`);
      Logger.info(`  Project: ${config.project || 'Not configured'} ${options.verbose ? `(${status.sources.project})` : ''}`);
      Logger.info(`  Board: ${config.board || 'Not configured'}`);
      
      // Show environment variable detection
      if (status.envVarsDetected.length > 0) {
        Logger.info(`\nEnvironment variables detected: ${status.envVarsDetected.join(', ')}`);
      }
      
      if (await configManager.isConfigured()) {
        Logger.success('\n✅ Configuration is complete!');
        if (configManager.isConfiguredViaEnvironment()) {
          Logger.info('🚀 Running in environment variable mode (perfect for CI/CD)');
        }
      } else {
        const errors = configManager.validate();
        Logger.warning('\n⚠️  Configuration incomplete:');
        errors.forEach(error => Logger.error(`  • ${error}`));
        
        // Provide contextual setup instructions
        Logger.info('\n📋 Setup Options:');
        
        if (status.envVarsDetected.length > 0) {
          Logger.info('  1. Complete environment variables:');
          const missing = [];
          if (!process.env.JIRA_HOST) missing.push('JIRA_HOST');
          if (!process.env.JIRA_EMAIL) missing.push('JIRA_EMAIL');
          if (!process.env.JIRA_TOKEN && !process.env.JIRA_API_TOKEN) missing.push('JIRA_TOKEN');
          if (!process.env.JIRA_PROJECT) missing.push('JIRA_PROJECT');
          
          if (missing.length > 0) {
            Logger.info(`     Missing: export ${missing.join(', ')}`);
          }
        } else {
          Logger.info('  1. Environment variables (enterprise/CI-friendly):');
          Logger.info('     export JIRA_HOST=company.atlassian.net');
          Logger.info('     export JIRA_EMAIL=user@company.com');
          Logger.info('     export JIRA_TOKEN=your_api_token');
          Logger.info('     export JIRA_PROJECT=PROJ');
        }
        
        Logger.info('  2. Interactive setup:');
        Logger.info('     jira auth set && jira init');
        Logger.info('  3. Copy .env.example to .env and customize');
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