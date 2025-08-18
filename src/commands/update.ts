import { Command } from 'commander';
import { ConfigManager } from '../config/jira.js';
import { CoreClient } from '../clients/core.js';
import { Logger } from '../utils/logger.js';
import { ErrorHandler } from '../utils/error-handler.js';
import { ADFBuilder } from '../utils/adf.js';
import { Formatter } from '../utils/formatter.js';
import { JQLSanitizer } from '../utils/jql-sanitizer.js';

interface UpdateOptions {
  status?: string;
  transition?: string;
  assignee?: string;
  priority?: string;
  labels?: string;
  comment?: string;
  dryRun?: boolean;
  fields?: string;
}

interface LabelOperation {
  add: string[];
  remove: string[];
  set?: string[];
}

export function createUpdateCommand(): Command {
  const update = new Command('update')
    .description('Update a Jira issue')
    .argument('<issueKey>', 'Issue key (e.g., PROJ-123)')
    .option('-s, --status <status>', 'Change issue status (searches for transition)')
    .option('-t, --transition <name>', 'Apply specific transition by name')
    .option('-a, --assignee <user>', 'Change assignee (email, accountId, or "me"/"unassigned")')
    .option('-p, --priority <priority>', 'Change priority')
    .option('-l, --labels <operations>', 'Modify labels (add:foo,bar remove:baz set:new,labels)')
    .option('-c, --comment <text>', 'Add comment with update')
    .option('--dry-run', 'Preview changes without applying')
    .option('--fields <fields>', 'Comma-separated list of fields to return')
    .action(async (issueKey: string, options: UpdateOptions) => {
      try {
        const configManager = new ConfigManager();
        const config = await configManager.getConfig();
        const client = new CoreClient(config);

        // Sanitize issue key
        const sanitizedKey = JQLSanitizer.sanitizeProjectKey(issueKey);
        
        Logger.startSpinner(`Fetching issue ${sanitizedKey}...`);
        
        // First, get the current issue state
        const currentIssue = await client.getIssue(sanitizedKey);
        Logger.stopSpinner(true);

        const updates: any = { fields: {} };
        const operations: string[] = [];

        // Handle status transition
        if (options.status || options.transition) {
          const transitionName = options.transition || options.status;
          Logger.startSpinner('Fetching available transitions...');
          
          const transitions = await client.getTransitions(sanitizedKey);
          Logger.stopSpinner(true);

          const transition = transitions.find(t => 
            t.name.toLowerCase() === transitionName?.toLowerCase()
          );

          if (!transition) {
            const availableTransitions = transitions.map(t => t.name).join(', ');
            throw new Error(
              `Transition "${transitionName}" not found. Available: ${availableTransitions}`
            );
          }

          operations.push(`Transition to "${transition.name}"`);
          
          // Transitions are applied separately from field updates
          if (!options.dryRun) {
            await client.transitionIssue(sanitizedKey, transition.id, options.comment);
          }
        }

        // Handle assignee update
        if (options.assignee) {
          let accountId: string | null = null;

          if (options.assignee === 'me') {
            // Get current user
            const currentUser = await client.getCurrentUser();
            accountId = currentUser.accountId;
            operations.push(`Assign to ${currentUser.displayName} (me)`);
          } else if (options.assignee === 'unassigned') {
            accountId = null;
            operations.push('Unassign issue');
          } else {
            // Search for user by email or display name
            const users = await client.searchUsers(options.assignee);
            if (users.length === 0) {
              throw new Error(`User "${options.assignee}" not found`);
            }
            accountId = users[0].accountId;
            operations.push(`Assign to ${users[0].displayName}`);
          }

          updates.fields.assignee = accountId ? { accountId } : null;
        }

        // Handle priority update
        if (options.priority) {
          updates.fields.priority = { name: options.priority };
          operations.push(`Set priority to "${options.priority}"`);
        }

        // Handle label operations
        if (options.labels) {
          const labelOps = parseLabelOperations(options.labels);
          const currentLabels = currentIssue.fields.labels || [];
          let newLabels = [...currentLabels];

          if (labelOps.set) {
            newLabels = labelOps.set;
            operations.push(`Set labels to: ${labelOps.set.join(', ')}`);
          } else {
            if (labelOps.add.length > 0) {
              newLabels = [...new Set([...newLabels, ...labelOps.add])];
              operations.push(`Add labels: ${labelOps.add.join(', ')}`);
            }
            if (labelOps.remove.length > 0) {
              newLabels = newLabels.filter(l => !labelOps.remove.includes(l));
              operations.push(`Remove labels: ${labelOps.remove.join(', ')}`);
            }
          }

          updates.fields.labels = newLabels;
        }

        // Add comment if provided (and not already added with transition)
        if (options.comment && !options.status && !options.transition) {
          operations.push('Add comment');
          if (!options.dryRun) {
            const adfComment = ADFBuilder.textToADF(options.comment);
            await client.addComment(sanitizedKey, adfComment);
          }
        }

        // Preview or apply changes
        if (options.dryRun) {
          Logger.info('🔍 Dry Run - Changes to be applied:');
          operations.forEach(op => Logger.info(`  • ${op}`));
          
          if (Logger.isJsonMode()) {
            ErrorHandler.success({
              dryRun: true,
              issueKey: sanitizedKey,
              operations,
              updates: updates.fields
            });
          }
        } else {
          // Apply field updates if any
          if (Object.keys(updates.fields).length > 0) {
            Logger.startSpinner('Applying updates...');
            await client.updateIssue(sanitizedKey, updates);
            Logger.stopSpinner(true);
          }

          // Fetch updated issue
          Logger.startSpinner('Fetching updated issue...');
          const updatedIssue = await client.getIssue(
            sanitizedKey,
            options.fields?.split(',')
          );
          Logger.stopSpinner(true);

          if (Logger.isJsonMode()) {
            ErrorHandler.success({
              updated: true,
              operations,
              issue: Formatter.formatJson(updatedIssue)
            });
          } else {
            Logger.success(`✅ Successfully updated ${sanitizedKey}`);
            operations.forEach(op => Logger.info(`  • ${op}`));
            console.log('\n' + Formatter.formatIssueDetail(updatedIssue));
          }
        }
      } catch (error) {
        ErrorHandler.handle(error);
      }
    });

  return update;
}

// Helper function to parse label operations
function parseLabelOperations(labelString: string): LabelOperation {
    const ops: LabelOperation = { add: [], remove: [] };
    
    // Parse operations like "add:foo,bar remove:baz" or "set:new,labels"
    const parts = labelString.split(/\s+/);
    
    for (const part of parts) {
      const [operation, values] = part.split(':');
      if (!values) continue;
      
      const labels = values.split(',').map(l => l.trim()).filter(Boolean);
      
      switch (operation.toLowerCase()) {
        case 'add':
          ops.add.push(...labels);
          break;
        case 'remove':
          ops.remove.push(...labels);
          break;
        case 'set':
          ops.set = labels;
          break;
      }
    }
    
    return ops;
}