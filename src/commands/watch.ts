import { Command } from 'commander';
import { ConfigManager } from '../config/jira.js';
import { CoreClient } from '../clients/core.js';
import { Logger } from '../utils/logger.js';
import { ErrorHandler } from '../utils/error-handler.js';
import { JQLSanitizer } from '../utils/jql-sanitizer.js';

interface WatchOptions {
  unwatch?: boolean;
  list?: boolean;
}

export function createWatchCommand(): Command {
  const watch = new Command('watch')
    .description('Watch or unwatch a Jira issue')
    .argument('<issueKey>', 'Issue key (e.g., PROJ-123)')
    .option('-u, --unwatch', 'Unwatch the issue instead of watching')
    .option('-l, --list', 'List current watchers')
    .action(async (issueKey: string, options: WatchOptions) => {
      try {
        const configManager = new ConfigManager();
        const config = await configManager.getConfig();
        const client = new CoreClient(config);

        // Sanitize issue key
        const sanitizedKey = JQLSanitizer.sanitizeProjectKey(issueKey);

        // Handle listing watchers
        if (options.list) {
          Logger.startSpinner(`Fetching watchers for ${sanitizedKey}...`);
          const watchersData = await client.getWatchers(sanitizedKey);
          Logger.stopSpinner(true);

          if (Logger.isJsonMode()) {
            ErrorHandler.success({
              issueKey: sanitizedKey,
              watcherCount: watchersData.watchCount,
              isWatching: watchersData.isWatching,
              watchers: watchersData.watchers?.map((w: any) => ({
                accountId: w.accountId,
                displayName: w.displayName,
                emailAddress: w.emailAddress
              }))
            });
          } else {
            Logger.info(`👁️  Watchers for ${sanitizedKey}:`);
            Logger.info(`  Total: ${watchersData.watchCount}`);
            Logger.info(`  You are ${watchersData.isWatching ? '' : 'not '}watching this issue`);
            
            if (watchersData.watchers && watchersData.watchers.length > 0) {
              Logger.info('\n  Watchers:');
              watchersData.watchers.forEach((w: any) => {
                Logger.info(`    • ${w.displayName}${w.emailAddress ? ` (${w.emailAddress})` : ''}`);
              });
            }
          }
          return;
        }

        // Handle watch/unwatch
        const action = options.unwatch ? 'unwatch' : 'watch';
        const actionVerb = options.unwatch ? 'Unwatching' : 'Watching';
        const actionPast = options.unwatch ? 'unwatched' : 'watching';

        Logger.startSpinner(`${actionVerb} ${sanitizedKey}...`);
        
        await client.watchIssue(sanitizedKey, !options.unwatch);
        
        Logger.stopSpinner(true);

        // Get updated watcher info
        const watchersData = await client.getWatchers(sanitizedKey);

        if (Logger.isJsonMode()) {
          ErrorHandler.success({
            action,
            issueKey: sanitizedKey,
            success: true,
            watcherCount: watchersData.watchCount,
            isWatching: watchersData.isWatching
          });
        } else {
          Logger.success(`✅ Successfully ${actionPast} ${sanitizedKey}`);
          Logger.info(`  Total watchers: ${watchersData.watchCount}`);
        }
      } catch (error) {
        ErrorHandler.handle(error);
      }
    });

  return watch;
}