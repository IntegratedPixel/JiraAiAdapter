import { Command } from 'commander';
import { statSync } from 'fs';
import { basename } from 'path';
import { ConfigManager } from '../config/jira.js';
import { CoreClient } from '../clients/core.js';
import { Logger } from '../utils/logger.js';
import { ErrorHandler } from '../utils/error-handler.js';
import { JQLSanitizer } from '../utils/jql-sanitizer.js';

interface AttachOptions {
  dryRun?: boolean;
}

export function createAttachCommand(): Command {
  const attach = new Command('attach')
    .description('Upload an attachment to a Jira issue')
    .argument('<issueKey>', 'Issue key (e.g., PROJ-123)')
    .argument('<file>', 'Path to file to attach')
    .option('--dry-run', 'Preview without uploading')
    .action(async (issueKey: string, filePath: string, options: AttachOptions) => {
      try {
        const configManager = new ConfigManager();
        const config = await configManager.getConfig();
        const client = new CoreClient(config);

        // Sanitize issue key
        const sanitizedKey = JQLSanitizer.sanitizeProjectKey(issueKey);

        // Check file exists and get stats
        let fileStats;
        try {
          fileStats = statSync(filePath);
        } catch (error) {
          throw new Error(`File not found: ${filePath}`);
        }

        if (!fileStats.isFile()) {
          throw new Error(`Not a file: ${filePath}`);
        }

        const fileName = basename(filePath);
        const fileSizeMB = (fileStats.size / (1024 * 1024)).toFixed(2);

        // Check file size (Jira typically has a 10MB limit by default)
        const maxSizeMB = 10;
        if (fileStats.size > maxSizeMB * 1024 * 1024) {
          throw new Error(`File too large: ${fileSizeMB}MB (max ${maxSizeMB}MB)`);
        }

        if (options.dryRun) {
          Logger.info('🔍 Dry Run - Attachment to be uploaded:');
          Logger.info(`  Issue: ${sanitizedKey}`);
          Logger.info(`  File: ${fileName}`);
          Logger.info(`  Size: ${fileSizeMB} MB`);
          Logger.info(`  Path: ${filePath}`);
          
          if (Logger.isJsonMode()) {
            ErrorHandler.success({
              dryRun: true,
              issueKey: sanitizedKey,
              attachment: {
                fileName,
                filePath,
                size: fileStats.size,
                sizeMB: parseFloat(fileSizeMB)
              }
            });
          }
        } else {
          Logger.startSpinner(`Uploading ${fileName} to ${sanitizedKey}...`);

          // Upload the file
          const attachment = await client.uploadAttachment(sanitizedKey, filePath);
          
          Logger.stopSpinner(true);

          if (Logger.isJsonMode()) {
            ErrorHandler.success({
              uploaded: true,
              issueKey: sanitizedKey,
              attachment: {
                id: attachment.id,
                filename: attachment.filename,
                size: attachment.size,
                mimeType: attachment.mimeType,
                created: attachment.created,
                author: attachment.author.displayName
              }
            });
          } else {
            Logger.success(`✅ Successfully uploaded ${fileName} to ${sanitizedKey}`);
            Logger.info(`  Attachment ID: ${attachment.id}`);
            Logger.info(`  Size: ${(attachment.size / 1024).toFixed(2)} KB`);
            Logger.info(`  MIME Type: ${attachment.mimeType}`);
            Logger.info(`  Uploaded by: ${attachment.author.displayName}`);
          }
        }
      } catch (error) {
        ErrorHandler.handle(error);
      }
    });

  return attach;
}