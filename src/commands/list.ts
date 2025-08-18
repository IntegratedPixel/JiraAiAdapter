import { Command } from 'commander';
import { ConfigManager } from '../config/jira.js';
import { CoreClient } from '../clients/core.js';
import { Logger } from '../utils/logger.js';
import { ErrorHandler } from '../utils/error-handler.js';
import { Formatter } from '../utils/formatter.js';
import { JQLSanitizer } from '../utils/jql-sanitizer.js';

export function createListCommand(): Command {
  const list = new Command('list')
    .description('List Jira issues')
    .option('-s, --status <status>', 'Filter by status')
    .option('-a, --assignee <assignee>', 'Filter by assignee (use "me" for yourself)')
    .option('-t, --type <type>', 'Filter by issue type')
    .option('-p, --priority <priority>', 'Filter by priority')
    .option('-l, --labels <labels>', 'Filter by labels (comma-separated)')
    .option('--sprint <sprint>', 'Filter by sprint (current, next, or sprint name)')
    .option('--limit <number>', 'Maximum number of issues to return', '20')
    .option('--page <number>', 'Page number (for pagination)', '0')
    .option('--jql <query>', 'Custom JQL query')
    .option('--fields <fields>', 'Comma-separated list of fields to return')
    .option('--mine', 'Show only issues assigned to me')
    .action(async (options) => {
      try {
        const configManager = new ConfigManager();
        const config = await configManager.getConfig();
        const client = new CoreClient(config);

        // Build JQL query
        let jql = '';
        const jqlParts: string[] = [];

        if (options.jql) {
          // Use custom JQL if provided (validate it first)
          jql = JQLSanitizer.validateJQL(options.jql);
        } else {
          // Build JQL from options with proper sanitization
          const projectKey = JQLSanitizer.sanitizeProjectKey(config.project);
          jqlParts.push(`project = ${projectKey}`);

          if (options.status) {
            jqlParts.push(`status = ${JQLSanitizer.sanitizeFieldValue(options.status)}`);
          }

          if (options.mine) {
            jqlParts.push('assignee = currentUser()');
          } else if (options.assignee) {
            if (options.assignee === 'me') {
              jqlParts.push('assignee = currentUser()');
            } else if (options.assignee === 'unassigned') {
              jqlParts.push('assignee is EMPTY');
            } else {
              jqlParts.push(`assignee = ${JQLSanitizer.sanitizeFieldValue(options.assignee)}`);
            }
          }

          if (options.type) {
            jqlParts.push(`issuetype = ${JQLSanitizer.sanitizeFieldValue(options.type)}`);
          }

          if (options.priority) {
            jqlParts.push(`priority = ${JQLSanitizer.sanitizeFieldValue(options.priority)}`);
          }

          if (options.labels) {
            const labels = options.labels.split(',').map((l: string) => l.trim());
            const labelQuery = labels.map((l: string) => 
              `labels = ${JQLSanitizer.sanitizeFieldValue(l)}`
            ).join(' AND ');
            jqlParts.push(`(${labelQuery})`);
          }

          if (options.sprint) {
            if (options.sprint === 'current') {
              jqlParts.push('sprint in openSprints()');
            } else if (options.sprint === 'next') {
              jqlParts.push('sprint in futureSprints()');
            } else {
              jqlParts.push(`sprint = ${JQLSanitizer.sanitizeFieldValue(options.sprint)}`);
            }
          }

          jql = jqlParts.join(' AND ') + ' ORDER BY updated DESC';
        }

        Logger.debug('JQL Query', { jql });
        Logger.startSpinner('Fetching issues...');

        const searchOptions = {
          jql,
          startAt: parseInt(options.page) * parseInt(options.limit),
          maxResults: parseInt(options.limit),
          fields: options.fields ? options.fields.split(',') : undefined,
        };

        const result = await client.searchIssues(searchOptions);
        
        Logger.stopSpinner(true);

        if (Logger.isJsonMode()) {
          ErrorHandler.success({
            total: result.total,
            startAt: result.startAt,
            maxResults: result.maxResults,
            issues: Formatter.formatJson(result.issues),
          });
        } else {
          if (result.issues.length === 0) {
            Logger.info('No issues found matching your criteria');
          } else {
            console.log(Formatter.formatIssuesTable(result.issues));
            
            const totalPages = Math.ceil(result.total / result.maxResults);
            const currentPage = Math.floor(result.startAt / result.maxResults) + 1;
            
            Logger.info(`\nShowing ${result.issues.length} of ${result.total} issues (Page ${currentPage}/${totalPages})`);
            
            if (result.total > result.startAt + result.maxResults) {
              Logger.info(`Use --page ${currentPage} to see the next page`);
            }
          }
        }
      } catch (error) {
        ErrorHandler.handle(error);
      }
    });

  return list;
}