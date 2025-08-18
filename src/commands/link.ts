import { Command } from 'commander';
import { ConfigManager } from '../config/jira.js';
import { CoreClient } from '../clients/core.js';
import { Logger } from '../utils/logger.js';
import { ErrorHandler } from '../utils/error-handler.js';
import { JQLSanitizer } from '../utils/jql-sanitizer.js';

interface LinkOptions {
  type?: string;
  list?: boolean;
  dryRun?: boolean;
}

export function createLinkCommand(): Command {
  const link = new Command('link')
    .description('Create or list issue links')
    .argument('[from]', 'Source issue key (e.g., PROJ-123)')
    .argument('[to]', 'Target issue key (e.g., PROJ-456)')
    .option('-t, --type <type>', 'Link type (default: "relates to")', 'relates to')
    .option('-l, --list', 'List available link types')
    .option('--dry-run', 'Preview without creating link')
    .action(async (fromKey: string | undefined, toKey: string | undefined, options: LinkOptions) => {
      try {
        const configManager = new ConfigManager();
        const config = await configManager.getConfig();
        const client = new CoreClient(config);

        // Handle listing link types
        if (options.list) {
          Logger.startSpinner('Fetching link types...');
          const linkTypes = await client.getIssueLinkTypes();
          Logger.stopSpinner(true);

          if (Logger.isJsonMode()) {
            ErrorHandler.success({
              linkTypes: linkTypes.map(lt => ({
                id: lt.id,
                name: lt.name,
                inward: lt.inward,
                outward: lt.outward
              }))
            });
          } else {
            Logger.info('Available link types:');
            linkTypes.forEach(lt => {
              Logger.info(`  • ${lt.name}`);
              Logger.info(`    - Inward: ${lt.inward} (e.g., "is blocked by")`);
              Logger.info(`    - Outward: ${lt.outward} (e.g., "blocks")`);
            });
          }
          return;
        }

        // Validate arguments for creating a link
        if (!fromKey || !toKey) {
          throw new Error('Both source and target issue keys are required');
        }

        // Sanitize issue keys
        const sanitizedFrom = JQLSanitizer.sanitizeProjectKey(fromKey);
        const sanitizedTo = JQLSanitizer.sanitizeProjectKey(toKey);

        // Validate link type exists
        Logger.startSpinner('Validating link type...');
        const linkTypes = await client.getIssueLinkTypes();
        const linkType = linkTypes.find(lt => 
          lt.name.toLowerCase() === options.type!.toLowerCase() ||
          lt.inward.toLowerCase() === options.type!.toLowerCase() ||
          lt.outward.toLowerCase() === options.type!.toLowerCase()
        );
        Logger.stopSpinner(true);

        if (!linkType) {
          const availableTypes = linkTypes.map(lt => lt.name).join(', ');
          throw new Error(
            `Link type "${options.type}" not found. Available types: ${availableTypes}`
          );
        }

        if (options.dryRun) {
          Logger.info('🔍 Dry Run - Link to be created:');
          Logger.info(`  From: ${sanitizedFrom}`);
          Logger.info(`  To: ${sanitizedTo}`);
          Logger.info(`  Type: ${linkType.name}`);
          Logger.info(`  Relationship: ${sanitizedFrom} ${linkType.outward} ${sanitizedTo}`);
          
          if (Logger.isJsonMode()) {
            ErrorHandler.success({
              dryRun: true,
              link: {
                from: sanitizedFrom,
                to: sanitizedTo,
                type: linkType.name,
                relationship: `${sanitizedFrom} ${linkType.outward} ${sanitizedTo}`
              }
            });
          }
        } else {
          Logger.startSpinner(`Creating link between ${sanitizedFrom} and ${sanitizedTo}...`);
          
          await client.createIssueLink(sanitizedFrom, sanitizedTo, linkType.name);
          
          Logger.stopSpinner(true);

          if (Logger.isJsonMode()) {
            ErrorHandler.success({
              created: true,
              link: {
                from: sanitizedFrom,
                to: sanitizedTo,
                type: linkType.name,
                relationship: `${sanitizedFrom} ${linkType.outward} ${sanitizedTo}`
              }
            });
          } else {
            Logger.success(`✅ Successfully linked issues`);
            Logger.info(`  ${sanitizedFrom} ${linkType.outward} ${sanitizedTo}`);
          }
        }
      } catch (error) {
        ErrorHandler.handle(error);
      }
    });

  return link;
}