import { Command } from 'commander';
import { ConfigManager } from '../config/jira.js';
import { CoreClient } from '../clients/core.js';
import { Logger } from '../utils/logger.js';
import { ErrorHandler } from '../utils/error-handler.js';

export function createUpdateCommand(): Command {
  const update = new Command('update')
    .description('Update an existing issue')
    .argument('<issueKey>', 'Issue key to update (e.g., PROJ-123)')
    .option('-s, --summary <summary>', 'New summary')
    .option('-d, --description <description>', 'New description')
    .option('-t, --type <type>', 'New issue type')
    .option('-p, --priority <priority>', 'New priority')
    .option('--status <status>', 'Transition to new status')
    .option('-l, --labels <operation>', 'Update labels (add:label1,label2 or remove:label1,label2 or set:label1,label2)')
    .option('-a, --assignee <assignee>', 'New assignee (email or username, or "unassigned")')
    .option('--parent <issueKey>', 'Convert to sub-task of parent (requires type change to Sub-task)')
    .option('--comment <comment>', 'Add a comment with the update')
    .option('--dry-run', 'Preview the update without applying it')
    .action(async (issueKey, options) => {
      try {
        const configManager = new ConfigManager();
        const config = await configManager.getConfig();
        const client = new CoreClient(config);

        // First, verify the issue exists
        let currentIssue;
        try {
          currentIssue = await client.getIssue(issueKey);
        } catch (error: any) {
          if (error.response?.statusCode === 404) {
            throw new Error(`Issue ${issueKey} not found. Please check the issue key.`);
          }
          throw error;
        }

        // Build update data
        const updateData: any = {};
        let hasUpdates = false;
        let needsConversion = false;

        if (options.summary) {
          updateData.summary = options.summary;
          hasUpdates = true;
        }

        if (options.description) {
          updateData.description = options.description;
          hasUpdates = true;
        }

        if (options.priority) {
          updateData.priority = options.priority;
          hasUpdates = true;
        }

        if (options.assignee) {
          updateData.assignee = options.assignee === 'unassigned' ? null : options.assignee;
          hasUpdates = true;
        }

        // Handle labels with operations
        if (options.labels) {
          const [operation, ...labelsParts] = options.labels.split(':');
          const labels = labelsParts.join(':').split(',').map((l: string) => l.trim());
          
          if (operation === 'add' || operation === 'remove') {
            updateData.labels = { [operation]: labels };
          } else if (operation === 'set') {
            updateData.labels = labels;
          } else {
            // If no operation specified, assume set
            updateData.labels = options.labels.split(',').map((l: string) => l.trim());
          }
          hasUpdates = true;
        }

        // Handle parent conversion (requires special handling)
        if (options.parent) {
          // Validate parent exists
          try {
            const parentIssue = await client.getIssue(options.parent);
            
            // Check if parent is already a sub-task
            if (parentIssue.fields.issuetype?.subtask) {
              throw new Error(`Cannot set ${options.parent} as parent - it is already a sub-task. Sub-tasks cannot have sub-tasks.`);
            }
            
            // Check if trying to set self as parent
            if (parentIssue.key === issueKey) {
              throw new Error('An issue cannot be its own parent');
            }
          } catch (error: any) {
            if (error.response?.statusCode === 404) {
              throw new Error(`Parent issue ${options.parent} not found. Please check the issue key.`);
            }
            if (error.message) {
              throw error;
            }
            throw new Error(`Failed to validate parent issue: ${error}`);
          }
          
          needsConversion = true;
          
          // Force type to Sub-task if parent is specified
          if (!options.type || !options.type.toLowerCase().includes('sub')) {
            Logger.warning('Parent specified - will convert issue to Sub-task type');
            options.type = 'Sub-task';
          }
        }

        // Handle type change
        if (options.type) {
          updateData.issueType = options.type;
          hasUpdates = true;
        }

        // Handle status transition
        let transitionId: string | undefined;
        if (options.status) {
          const transitions = await client.getTransitions(issueKey);
          const transition = transitions.find(t => 
            t.name.toLowerCase() === options.status.toLowerCase()
          );
          
          if (!transition) {
            const availableStatuses = transitions.map(t => t.name).join(', ');
            throw new Error(`Status '${options.status}' not available. Available: ${availableStatuses}`);
          }
          
          transitionId = transition.id;
        }

        if (!hasUpdates && !transitionId && !needsConversion) {
          Logger.warning('No updates specified');
          return;
        }

        // Dry run mode
        if (options.dryRun) {
          Logger.info('Dry run mode - no changes will be made');
          Logger.info('\nChanges to apply:');
          
          if (hasUpdates) {
            console.log('Field updates:', JSON.stringify(updateData, null, 2));
          }
          
          if (transitionId) {
            console.log(`Status transition: ${options.status}`);
          }
          
          if (needsConversion) {
            console.log(`Convert to sub-task of: ${options.parent}`);
          }
          
          return;
        }

        // Execute updates
        Logger.startSpinner('Updating issue...');

        // Handle parent conversion if needed
        if (needsConversion && options.parent) {
          // Check if already a sub-task
          if (currentIssue.fields.issuetype?.subtask) {
            if (currentIssue.fields.parent?.key === options.parent) {
              Logger.warning(`Issue is already a sub-task of ${options.parent}`);
            } else {
              // Need to change parent - this is complex and may not be supported
              throw new Error('Changing parent of existing sub-task is not yet supported');
            }
          } else {
            // Check if the issue type is actually named Sub-task but not marked as subtask
            if (currentIssue.fields.issuetype?.name?.toLowerCase().includes('sub')) {
              Logger.info('Issue type appears to be Sub-task, attempting to set parent only');
            }
            
            // Try to convert to sub-task
            try {
              await client.convertToSubtask(issueKey, options.parent);
              Logger.success(`Converted to sub-task of ${options.parent}`);
            } catch (error: any) {
              // If conversion fails, provide helpful context
              if (error.message?.includes('Issue type conversion not supported')) {
                Logger.error('\n' + error.message);
                
                // Check if we can at least tell the user the current state
                Logger.info(`\nCurrent issue details:`);
                Logger.info(`- Key: ${currentIssue.key}`);
                Logger.info(`- Type: ${currentIssue.fields.issuetype?.name}`);
                Logger.info(`- Is Subtask: ${currentIssue.fields.issuetype?.subtask ? 'Yes' : 'No'}`);
                
                throw new Error('Cannot convert issue type in this Jira configuration');
              }
              throw error;
            }
          }
        }

        // Apply field updates
        if (hasUpdates && !needsConversion) {
          // Regular update (not conversion)
          await client.updateIssue(issueKey, updateData);
        } else if (hasUpdates && needsConversion) {
          // After conversion, apply any other field updates
          // (conversion might have already handled some fields)
          const fieldsToUpdate = { ...updateData };
          delete fieldsToUpdate.issueType; // Type was handled in conversion
          
          if (Object.keys(fieldsToUpdate).length > 0) {
            await client.updateIssue(issueKey, fieldsToUpdate);
          }
        }

        // Apply status transition
        if (transitionId) {
          await client.transitionIssue(issueKey, transitionId, options.comment);
          Logger.success(`Transitioned to ${options.status}`);
        } else if (options.comment) {
          // Add comment even if no transition
          await client.addComment(issueKey, options.comment);
        }

        Logger.stopSpinner(true, 'Issue updated successfully!');

        // Fetch and display updated issue
        const updatedIssue = await client.getIssue(issueKey);
        
        if (Logger.isJsonMode()) {
          ErrorHandler.success({
            key: updatedIssue.key,
            summary: updatedIssue.fields.summary,
            type: updatedIssue.fields.issuetype?.name,
            status: updatedIssue.fields.status?.name,
            parent: updatedIssue.fields.parent?.key,
            url: `https://${config.host}/browse/${updatedIssue.key}`,
          });
        } else {
          Logger.success(`\nUpdated issue: ${updatedIssue.key}`);
          Logger.info(`Summary: ${updatedIssue.fields.summary}`);
          Logger.info(`Type: ${updatedIssue.fields.issuetype?.name}`);
          Logger.info(`Status: ${updatedIssue.fields.status?.name}`);
          if (updatedIssue.fields.parent) {
            Logger.info(`Parent: ${updatedIssue.fields.parent.key}`);
          }
          Logger.info(`URL: https://${config.host}/browse/${updatedIssue.key}`);
        }

      } catch (error) {
        ErrorHandler.handle(error);
      }
    });

  return update;
}