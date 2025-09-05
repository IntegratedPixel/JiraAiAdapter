import { Command } from 'commander';
import { readFileSync, existsSync } from 'fs';
import { ConfigManager } from '../config/jira.js';
import { CoreClient } from '../clients/core.js';
import { Logger } from '../utils/logger.js';
import { ErrorHandler } from '../utils/error-handler.js';

export function createUpdateCommand(): Command {
  const update = new Command('update')
    .description('Update an existing Jira issue - modify any field including summary, description, priority, story points, Epic links, status transitions, labels, and assignee. Supports adding comments with updates.')
    .argument('<issueKey>', 'Issue key to update (e.g., PROJ-123)')
    .option('-s, --summary <summary>', 'New summary')
    .option('-d, --description <description>', 'New description')
    .option('--description-file <file>', 'Read description from file')
    .option('-t, --type <type>', 'New issue type')
    .option('-p, --priority <priority>', 'New priority')
    .option('--story-points <number>', 'Set story points (numeric value)')
    .option('--status <status>', 'Transition to new status')
    .option('-l, --labels <operation>', 'Update labels (add:label1,label2 or remove:label1,label2 or set:label1,label2)')
    .option('-a, --assignee <assignee>', 'New assignee (email or username, or "unassigned")')
    .option('--parent <issueKey>', 'Convert to sub-task of parent (requires type change to Sub-task)')
    .option('--epic <epicKey>', 'Link to Epic by key (PROJ-123) or remove from Epic with "none". Updates Epic-Story relationship for Agile planning.')
    .option('--project <key>', 'Specify project context (overrides default)')
    .option('--board <name>', 'Specify board name (overrides default board)')
    .option('--comment <comment>', 'Add a comment with the update')
    .option('--dry-run', 'Preview the update without applying it')
    .action(async (issueKey, options) => {
      try {
        const configManager = new ConfigManager();
        // Apply command-line project overrides  
        const configOverrides = {
          project: options.project,
          board: options.board,
        };
        const config = await configManager.getConfig(configOverrides);
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
        } else if (options.descriptionFile) {
          if (!existsSync(options.descriptionFile)) {
            throw new Error(`File not found: ${options.descriptionFile}`);
          }
          updateData.description = readFileSync(options.descriptionFile, 'utf-8');
          hasUpdates = true;
        }

        if (options.priority) {
          updateData.priority = options.priority;
          hasUpdates = true;
        }

        if (options.storyPoints !== undefined) {
          const storyPoints = parseFloat(options.storyPoints);
          if (isNaN(storyPoints) || storyPoints < 0) {
            throw new Error('Story points must be a non-negative number');
          }
          updateData.storyPoints = storyPoints;
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

        // Handle epic link change
        if (options.epic !== undefined) {
          if (options.epic === 'none' || options.epic === '') {
            updateData.epic = null; // Remove from epic
            Logger.info('Will remove issue from epic');
          } else {
            // Validate epic exists
            try {
              const epicIssue = await client.getIssue(options.epic);
              
              // Check if epic is actually an Epic type
              if (!epicIssue.fields.issuetype?.name?.toLowerCase().includes('epic')) {
                Logger.warning(`${options.epic} is not an Epic type, but will attempt to link anyway`);
              }
            } catch (error: any) {
              if (error.response?.statusCode === 404) {
                throw new Error(`Epic issue ${options.epic} not found. Please check the issue key.`);
              }
              throw new Error(`Failed to validate epic issue: ${error}`);
            }
            
            updateData.epic = options.epic;
            Logger.info(`Will link issue to epic ${options.epic}`);
          }
          hasUpdates = true;
        }

        // Handle type change
        if (options.type) {
          updateData.issueType = options.type;
          hasUpdates = true;
        }

        // Handle status transition (smart discovery)
        let transitionId: string | undefined;
        if (options.status) {
          Logger.startSpinner(`Finding transition to status "${options.status}"...`);
          
          const transitionInfo = await client.findTransitionToStatus(issueKey, options.status);
          
          if (transitionInfo) {
            transitionId = transitionInfo.transitionId;
            Logger.stopSpinner(true, `Found transition: "${transitionInfo.transitionName}"`);
          } else {
            Logger.stopSpinner(false);
            
            // Get available transitions to provide helpful error message
            const transitions = await client.getTransitions(issueKey);
            const availableStatuses = transitions.map(t => `"${t.to.name}" (via "${t.name}")`).join(', ');
            
            throw new Error(
              `No transition available to status "${options.status}".\n` +
              `Available transitions: ${availableStatuses}`
            );
          }
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
                Logger.info('\nCurrent issue details:');
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