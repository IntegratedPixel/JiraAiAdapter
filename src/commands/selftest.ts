import { Command } from 'commander';
import inquirer from 'inquirer';
import { ConfigManager } from '../config/config-manager.js';
import { CoreClient } from '../clients/core.js';
import { Logger } from '../utils/logger.js';
import { ErrorHandler } from '../utils/error-handler.js';

interface StepResult {
  step: number;
  name: string;
  passed: boolean;
  detail: string;
  error?: string;
}

export function createSelftestCommand(): Command {
  const selftestCmd = new Command('selftest')
    .description('Run a self-test to verify Jira connectivity, create/search/update/delete an issue')
    .option('--project <key>', 'Specify project context (overrides default)')
    .option('--board <name>', 'Specify board name (overrides default board)')
    .action(async (options) => {
      const results: StepResult[] = [];
      let createdIssueKey: string | null = null;

      try {
        const configManager = new ConfigManager();
        await configManager.loadTokenFromKeychain();
        const config = await configManager.getConfig({
          project: options.project,
          board: options.board,
        });

        // Show config and confirm
        Logger.info('Selftest configuration:');
        Logger.info(`  Host:               ${config.host}`);
        Logger.info(`  Email:              ${config.email}`);
        Logger.info(`  Project:            ${config.project}`);
        Logger.info(`  Board:              ${config.board || '(not set)'}`);
        Logger.info(`  Default Issue Type: ${config.defaultIssueType || 'Task'}`);
        Logger.info('');

        const skipConfirmation = process.env.JIRA_CLI_YES_MODE === 'true';
        if (!skipConfirmation) {
          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: 'This will create and delete a test issue. Continue?',
              default: true,
            },
          ]);
          if (!confirm) {
            Logger.info('Selftest cancelled');
            return;
          }
        }

        const client = new CoreClient(config);
        const issueType = config.defaultIssueType || 'Task';
        const timestamp = new Date().toISOString();

        // Step 1: Test connection
        Logger.startSpinner('Step 1/5: Testing connection...');
        try {
          const user = await client.testConnection();
          const detail = `Connected as ${user.displayName} (${user.emailAddress || user.accountId})`;
          Logger.stopSpinner(true, `Step 1/5: ${detail}`);
          results.push({ step: 1, name: 'testConnection', passed: true, detail });
        } catch (err: any) {
          Logger.stopSpinner(false, 'Step 1/5: Connection failed');
          results.push({ step: 1, name: 'testConnection', passed: false, detail: 'Connection failed', error: err.message });
          // Fatal — skip remaining steps
          printSummary(results, config);
          process.exit(1);
        }

        // Step 2: Create issue
        Logger.startSpinner('Step 2/5: Creating test issue...');
        try {
          const issue = await client.createIssue({
            summary: `[SELFTEST] CLI test ${timestamp}`,
            issueType,
          });
          createdIssueKey = issue.key;
          const detail = `Created ${issue.key}`;
          Logger.stopSpinner(true, `Step 2/5: ${detail}`);
          results.push({ step: 2, name: 'createIssue', passed: true, detail });
        } catch (err: any) {
          Logger.stopSpinner(false, 'Step 2/5: Create issue failed');
          results.push({ step: 2, name: 'createIssue', passed: false, detail: 'Create issue failed', error: err.message });
          // Fatal — skip remaining steps
          printSummary(results, config);
          process.exit(1);
        }

        try {
          // Step 3: Search for the created issue
          Logger.startSpinner('Step 3/5: Searching for test issue...');
          try {
            const searchResult = await client.searchIssues({
              jql: `key = ${createdIssueKey}`,
              maxResults: 1,
            });
            const found = searchResult.issues?.some((i: any) => i.key === createdIssueKey);
            if (found) {
              const detail = `Found ${createdIssueKey} via search`;
              Logger.stopSpinner(true, `Step 3/5: ${detail}`);
              results.push({ step: 3, name: 'searchIssues', passed: true, detail });
            } else {
              Logger.stopSpinner(false, `Step 3/5: Issue ${createdIssueKey} not found in search results`);
              results.push({ step: 3, name: 'searchIssues', passed: false, detail: 'Issue not found in search results' });
            }
          } catch (err: any) {
            Logger.stopSpinner(false, 'Step 3/5: Search failed');
            results.push({ step: 3, name: 'searchIssues', passed: false, detail: 'Search failed', error: err.message });
          }

          // Step 4: Update issue and verify
          Logger.startSpinner('Step 4/5: Updating test issue...');
          try {
            const newSummary = `[SELFTEST] CLI test ${timestamp} (updated)`;
            await client.updateIssue(createdIssueKey!, { summary: newSummary });
            const updated = await client.getIssue(createdIssueKey!);
            if (updated.fields.summary === newSummary) {
              const detail = `Updated and verified summary on ${createdIssueKey}`;
              Logger.stopSpinner(true, `Step 4/5: ${detail}`);
              results.push({ step: 4, name: 'updateIssue', passed: true, detail });
            } else {
              Logger.stopSpinner(false, 'Step 4/5: Summary mismatch after update');
              results.push({ step: 4, name: 'updateIssue', passed: false, detail: 'Summary mismatch after update' });
            }
          } catch (err: any) {
            Logger.stopSpinner(false, 'Step 4/5: Update failed');
            results.push({ step: 4, name: 'updateIssue', passed: false, detail: 'Update failed', error: err.message });
          }
        } finally {
          // Step 5: Delete (always runs)
          Logger.startSpinner('Step 5/5: Cleaning up test issue...');
          try {
            await client.deleteIssue(createdIssueKey!);
            const detail = `Deleted ${createdIssueKey}`;
            Logger.stopSpinner(true, `Step 5/5: ${detail}`);
            results.push({ step: 5, name: 'deleteIssue', passed: true, detail });
          } catch (err: any) {
            Logger.stopSpinner(false, `Step 5/5: Failed to delete ${createdIssueKey}`);
            results.push({ step: 5, name: 'deleteIssue', passed: false, detail: `Failed to delete ${createdIssueKey}`, error: err.message });
          }
        }

        printSummary(results, config);

        const allPassed = results.every(r => r.passed);
        if (!allPassed) {
          process.exit(1);
        }
      } catch (error) {
        // Clean up if we created an issue but hit an unexpected error
        if (createdIssueKey) {
          try {
            const configManager = new ConfigManager();
            await configManager.loadTokenFromKeychain();
            const config = await configManager.getConfig({ project: options.project, board: options.board });
            const client = new CoreClient(config);
            await client.deleteIssue(createdIssueKey);
          } catch {
            // best effort cleanup
          }
        }
        ErrorHandler.handle(error);
      }
    });

  return selftestCmd;
}

function printSummary(results: StepResult[], config: { host: string; email: string; project: string; board?: string }): void {
  const allPassed = results.every(r => r.passed);
  const failures = results.filter(r => !r.passed);

  if (Logger.isJsonMode()) {
    ErrorHandler.success({
      allPassed,
      config: {
        host: config.host,
        email: config.email,
        project: config.project,
        board: config.board || null,
      },
      steps: results,
    });
    return;
  }

  Logger.info('');
  if (allPassed) {
    Logger.success(`All ${results.length} steps passed`);
  } else {
    Logger.error(`${failures.length} of ${results.length} steps failed:`);
    for (const f of failures) {
      Logger.error(`  Step ${f.step} (${f.name}): ${f.detail}${f.error ? ' — ' + f.error : ''}`);
    }
  }
}
