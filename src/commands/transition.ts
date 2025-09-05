import { Command } from 'commander';
import { readFileSync, existsSync } from 'fs';
import { ConfigManager } from '../config/jira.js';
import { CoreClient } from '../clients/core.js';
import { Logger } from '../utils/logger.js';
import { ErrorHandler } from '../utils/error-handler.js';
import { JiraTransition } from '../types/jira.js';
import Table from 'cli-table3';

export function createTransitionCommand(): Command {
  const transition = new Command('transition')
    .description('Transition an issue through workflow')
    .argument('<issueKey>', 'Issue key to transition (e.g., PROJ-123)')
    .argument('[transitionName]', 'Transition name to execute (if not provided, will list available)')
    .option('--to <status>', 'Target status (will find appropriate transition)')
    .option('-c, --comment <comment>', 'Add comment with transition')
    .option('--comment-file <file>', 'Read comment from file')
    .option('-l, --list', 'List available transitions')
    .option('--project <key>', 'Specify project context (overrides default)')
    .option('--board <name>', 'Specify board name (overrides default board)')
    .action(async (issueKey, transitionName, options) => {
      try {
        const configManager = new ConfigManager();
        // Apply command-line project overrides
        const configOverrides = {
          project: options.project,
          board: options.board,
        };
        const config = await configManager.getConfig(configOverrides);
        const client = new CoreClient(config);

        // Verify issue exists and get current status
        Logger.startSpinner(`Checking issue ${issueKey}...`);
        let issue;
        try {
          issue = await client.getIssue(issueKey);
        } catch (error) {
          Logger.stopSpinner(false);
          throw new Error(`Issue ${issueKey} not found or not accessible`);
        }

        const currentStatus = issue.fields.status?.name || 'Unknown';
        Logger.stopSpinner(true, `Current status: ${currentStatus}`);

        // Get available transitions
        Logger.startSpinner('Getting available transitions...');
        const transitions = await client.getTransitions(issueKey);
        Logger.stopSpinner(true);

        if (transitions.length === 0) {
          Logger.warning('No transitions available for this issue');
          return;
        }

        // Handle different modes
        if (options.list || (!transitionName && !options.to)) {
          // List available transitions
          displayTransitions(transitions, currentStatus);
          return;
        }

        // Find the transition to execute
        let targetTransition: JiraTransition | undefined;

        if (options.to) {
          // Find transition by target status
          targetTransition = transitions.find(t => 
            t.to.name.toLowerCase() === options.to.toLowerCase()
          );
          if (!targetTransition) {
            Logger.error(`No transition available to status "${options.to}"`);
            Logger.info('\nAvailable transitions:');
            displayTransitions(transitions, currentStatus);
            process.exit(1);
          }
        } else if (transitionName) {
          // Find transition by name
          targetTransition = transitions.find(t => 
            t.name.toLowerCase() === transitionName.toLowerCase()
          );
          if (!targetTransition) {
            Logger.error(`Transition "${transitionName}" not found`);
            Logger.info('\nAvailable transitions:');
            displayTransitions(transitions, currentStatus);
            process.exit(1);
          }
        }

        if (!targetTransition) {
          Logger.error('No transition specified. Use --to <status> or provide transition name');
          return;
        }

        // Prepare comment if provided
        let comment: string | undefined;
        if (options.comment) {
          comment = options.comment;
        } else if (options.commentFile) {
          if (!existsSync(options.commentFile)) {
            throw new Error(`Comment file not found: ${options.commentFile}`);
          }
          comment = readFileSync(options.commentFile, 'utf-8').trim();
        }

        // Execute the transition
        const targetStatus = targetTransition.to.name;
        Logger.startSpinner(`Transitioning ${issueKey}: ${currentStatus} → ${targetStatus}...`);
        
        await client.transitionIssue(issueKey, targetTransition.id, comment);
        
        Logger.stopSpinner(true, `Successfully transitioned to ${targetStatus}`);

        // Display success message
        if (Logger.isJsonMode()) {
          ErrorHandler.success({
            issueKey,
            transitionName: targetTransition.name,
            fromStatus: currentStatus,
            toStatus: targetStatus,
            comment: comment || null,
            url: `https://${config.host}/browse/${issueKey}`,
          });
        } else {
          Logger.success(`✅ ${issueKey} transitioned: ${currentStatus} → ${targetStatus}`);
          if (comment) {
            Logger.info(`💬 Comment added: "${comment.length > 50 ? comment.substring(0, 50) + '...' : comment}"`);
          }
          Logger.info(`🔗 View: https://${config.host}/browse/${issueKey}`);
        }

      } catch (error) {
        ErrorHandler.handle(error);
      }
    });

  return transition;
}

/**
 * Display available transitions in a formatted table
 */
function displayTransitions(transitions: JiraTransition[], currentStatus: string): void {
  Logger.info(`\nAvailable transitions from "${currentStatus}":\n`);
  
  const table = new Table({
    head: ['Transition Name', 'Target Status'],
    style: { head: ['cyan'] },
    colWidths: [30, 20],
  });

  transitions.forEach(transition => {
    table.push([
      transition.name,
      transition.to.name,
    ]);
  });

  console.log(table.toString());
  
  Logger.info('\nUsage:');
  Logger.info(`  jira transition ${transitions[0] ? 'ISSUE-123' : '<issue>'} "${transitions[0]?.name || '<transition-name>'}"`);
  Logger.info(`  jira transition ${transitions[0] ? 'ISSUE-123' : '<issue>'} --to "${transitions[0]?.to.name || '<status>'}"`);
}