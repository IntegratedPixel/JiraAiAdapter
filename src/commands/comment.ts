import { Command } from 'commander';
import { readFileSync, existsSync } from 'fs';
import { ConfigManager } from '../config/jira.js';
import { CoreClient } from '../clients/core.js';
import { Logger } from '../utils/logger.js';
import { ErrorHandler } from '../utils/error-handler.js';

export function createCommentCommand(): Command {
  const comment = new Command('comment')
    .description('Add a comment to an issue')
    .argument('<issueKey>', 'Issue key to comment on (e.g., PROJ-123)')
    .argument('[message]', 'Comment message (if not provided, will open editor)')
    .option('-f, --file <file>', 'Read comment from file')
    .option('--project <key>', 'Specify project context (overrides default)')
    .option('--board <name>', 'Specify board name (overrides default board)')
    .action(async (issueKey, message, options) => {
      try {
        const configManager = new ConfigManager();
        // Apply command-line project overrides
        const configOverrides = {
          project: options.project,
          board: options.board,
        };
        const config = await configManager.getConfig(configOverrides);
        const client = new CoreClient(config);

        // Determine comment content
        let commentText = message;
        
        if (options.file) {
          // Read from file
          if (!existsSync(options.file)) {
            throw new Error(`File not found: ${options.file}`);
          }
          commentText = readFileSync(options.file, 'utf-8').trim();
        } else if (!commentText) {
          // Interactive editor mode
          const inquirer = await import('inquirer');
          const answers = await inquirer.default.prompt([
            {
              type: 'editor',
              name: 'comment',
              message: 'Enter your comment:',
              validate: (input: string) => input.trim().length > 0 || 'Comment cannot be empty',
            },
          ]);
          commentText = answers.comment.trim();
        }

        if (!commentText) {
          throw new Error('Comment cannot be empty');
        }

        // Verify issue exists first
        Logger.startSpinner(`Verifying issue ${issueKey}...`);
        try {
          await client.getIssue(issueKey);
        } catch (error) {
          Logger.stopSpinner(false);
          throw new Error(`Issue ${issueKey} not found or not accessible`);
        }

        Logger.stopSpinner(true);
        Logger.startSpinner('Adding comment...');

        // Add the comment
        const addedComment = await client.addComment(issueKey, commentText);

        Logger.stopSpinner(true, `Comment added to ${issueKey}`);

        // Display success message
        if (Logger.isJsonMode()) {
          ErrorHandler.success({
            issueKey,
            commentId: addedComment.id,
            commentText: commentText,
            url: `https://${config.host}/browse/${issueKey}`,
          });
        } else {
          Logger.success(`✅ Comment added to ${issueKey}`);
          Logger.info(`📝 "${commentText.length > 50 ? commentText.substring(0, 50) + '...' : commentText}"`);
          Logger.info(`🔗 View: https://${config.host}/browse/${issueKey}`);
        }

      } catch (error) {
        ErrorHandler.handle(error);
      }
    });

  return comment;
}