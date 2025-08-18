import { Command } from 'commander';
import { readFileSync } from 'fs';
import { ConfigManager } from '../config/jira.js';
import { CoreClient } from '../clients/core.js';
import { Logger } from '../utils/logger.js';
import { ErrorHandler } from '../utils/error-handler.js';
import { ADFBuilder } from '../utils/adf.js';
import { JQLSanitizer } from '../utils/jql-sanitizer.js';

interface CommentOptions {
  file?: string;
  mention?: string[];
  dryRun?: boolean;
}

export function createCommentCommand(): Command {
  const comment = new Command('comment')
    .description('Add a comment to a Jira issue')
    .argument('<issueKey>', 'Issue key (e.g., PROJ-123)')
    .argument('[message]', 'Comment text (use --file for longer comments)')
    .option('-f, --file <path>', 'Read comment from file')
    .option('-m, --mention <users...>', 'Mention users in comment (email or @username)')
    .option('--dry-run', 'Preview comment without posting')
    .action(async (issueKey: string, message: string | undefined, options: CommentOptions) => {
      try {
        const configManager = new ConfigManager();
        const config = await configManager.getConfig();
        const client = new CoreClient(config);

        // Sanitize issue key
        const sanitizedKey = JQLSanitizer.sanitizeProjectKey(issueKey);

        // Get comment text
        let commentText = message || '';
        if (options.file) {
          try {
            commentText = readFileSync(options.file, 'utf-8');
            Logger.debug(`Read comment from file: ${options.file}`);
          } catch (error) {
            throw new Error(`Failed to read file: ${options.file}`);
          }
        }

        if (!commentText.trim()) {
          throw new Error('Comment text is required (provide as argument or via --file)');
        }

        // Process mentions
        const mentions: Array<{ accountId: string; displayName: string }> = [];
        if (options.mention && options.mention.length > 0) {
          Logger.startSpinner('Resolving user mentions...');
          
          for (const userQuery of options.mention) {
            // Remove @ prefix if present
            const query = userQuery.startsWith('@') ? userQuery.slice(1) : userQuery;
            
            const users = await client.searchUsers(query);
            if (users.length === 0) {
              Logger.warning(`User not found: ${query}`);
              continue;
            }
            
            const user = users[0];
            mentions.push({
              accountId: user.accountId,
              displayName: user.displayName
            });
            
            // Add mention to comment text if not already present
            if (!commentText.includes(`@${user.displayName}`) && !commentText.includes(`@${query}`)) {
              commentText = `@${user.displayName} ${commentText}`;
            }
          }
          
          Logger.stopSpinner(true);
        }

        // Convert to ADF with mention support
        let adfComment = ADFBuilder.textToADF(commentText);
        
        // Add mention nodes if any
        if (mentions.length > 0 && adfComment.content.length > 0) {
          // If the first paragraph contains mention text, replace with actual mention nodes
          const firstNode = adfComment.content[0];
          if (firstNode.type === 'paragraph' && firstNode.content) {
            const newContent: any[] = [];
            
            for (const mention of mentions) {
              newContent.push(ADFBuilder.createMention(mention.accountId, mention.displayName));
              newContent.push({ type: 'text', text: ' ' });
            }
            
            // Add the rest of the content
            const remainingText = commentText.replace(/@[\w.]+\s*/g, '').trim();
            if (remainingText) {
              const remainingNodes = ADFBuilder.textToADF(remainingText);
              if (remainingNodes.content.length > 0 && remainingNodes.content[0].content) {
                newContent.push(...remainingNodes.content[0].content);
              }
            }
            
            adfComment.content[0].content = newContent;
          }
        }

        if (options.dryRun) {
          Logger.info('🔍 Dry Run - Comment to be posted:');
          Logger.info('----------------------------------------');
          console.log(ADFBuilder.adfToText(adfComment));
          Logger.info('----------------------------------------');
          
          if (mentions.length > 0) {
            Logger.info('Mentions:');
            mentions.forEach(m => Logger.info(`  • @${m.displayName} (${m.accountId})`));
          }
          
          if (Logger.isJsonMode()) {
            ErrorHandler.success({
              dryRun: true,
              issueKey: sanitizedKey,
              comment: {
                text: ADFBuilder.adfToText(adfComment),
                adf: adfComment,
                mentions
              }
            });
          }
        } else {
          Logger.startSpinner(`Adding comment to ${sanitizedKey}...`);
          
          const postedComment = await client.addComment(sanitizedKey, adfComment);
          
          Logger.stopSpinner(true);
          
          if (Logger.isJsonMode()) {
            ErrorHandler.success({
              posted: true,
              issueKey: sanitizedKey,
              comment: {
                id: postedComment.id,
                author: postedComment.author.displayName,
                created: postedComment.created,
                body: ADFBuilder.adfToText(postedComment.body)
              }
            });
          } else {
            Logger.success(`✅ Comment added to ${sanitizedKey}`);
            Logger.info(`Comment ID: ${postedComment.id}`);
            Logger.info(`Author: ${postedComment.author.displayName}`);
            Logger.info(`Created: ${new Date(postedComment.created).toLocaleString()}`);
          }
        }
      } catch (error) {
        ErrorHandler.handle(error);
      }
    });

  return comment;
}