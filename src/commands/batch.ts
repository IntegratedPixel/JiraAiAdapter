import { Command } from 'commander';
import { readFileSync, writeFileSync } from 'fs';
import inquirer from 'inquirer';
import { ConfigManager } from '../config/jira.js';
import { CoreClient } from '../clients/core.js';
import { Logger } from '../utils/logger.js';
import { ErrorHandler } from '../utils/error-handler.js';
import { MarkdownParser, ParsedIssue } from '../utils/markdown-parser.js';
import Table from 'cli-table3';

export function createBatchCommand(): Command {
  const batch = new Command('batch')
    .description('Batch operations for multiple Jira issues');

  batch
    .command('create')
    .description('Create multiple issues from a file')
    .argument('<file>', 'Input file (JSON or Markdown)')
    .option('--dry-run', 'Preview issues without creating them')
    .option('--interactive', 'Review and modify each issue before creation')
    .option('--output <file>', 'Save results to file')
    .option('--type <type>', 'Default issue type', 'Task')
    .option('--labels <labels>', 'Additional labels (comma-separated)')
    .option('--assignee <user>', 'Default assignee')
    .action(async (file, options) => {
      try {
        const configManager = new ConfigManager();
        await configManager.loadTokenFromKeychain();
        const config = await configManager.getConfig();
        const client = new CoreClient(config);

        // Parse input file
        let issues: ParsedIssue[];
        
        if (file.endsWith('.md') || file.endsWith('.markdown')) {
          Logger.info('Parsing markdown file...');
          issues = MarkdownParser.parseFile(file);
        } else if (file.endsWith('.json')) {
          Logger.info('Loading JSON file...');
          const content = readFileSync(file, 'utf-8');
          issues = JSON.parse(content);
        } else {
          throw new Error('Unsupported file format. Use .md, .markdown, or .json');
        }

        if (issues.length === 0) {
          Logger.warning('No issues found in file');
          return;
        }

        Logger.info(`Found ${issues.length} potential issues`);

        // Apply default options
        if (options.labels) {
          const additionalLabels = options.labels.split(',').map((l: string) => l.trim());
          issues.forEach(issue => {
            issue.labels = [...(issue.labels || []), ...additionalLabels];
          });
        }

        if (options.assignee) {
          issues.forEach(issue => {
            if (!issue.assignee) {
              issue.assignee = options.assignee;
            }
          });
        }

        // Interactive review if requested
        if (options.interactive) {
          issues = await interactiveReview(issues);
        }

        // Preview mode
        if (options.dryRun) {
          Logger.info('\n📋 Preview Mode - Issues to be created:\n');
          displayIssuesTable(issues);
          
          if (options.output) {
            writeFileSync(options.output, JSON.stringify(issues, null, 2));
            Logger.success(`Preview saved to ${options.output}`);
          }
          
          return;
        }

        // Create issues
        const results = await createIssues(client, issues);

        // Display results
        Logger.success(`\n✅ Created ${results.success.length} issues`);
        if (results.failed.length > 0) {
          Logger.error(`❌ Failed to create ${results.failed.length} issues`);
        }

        // Display created issues
        if (results.success.length > 0) {
          const table = new Table({
            head: ['Key', 'Summary', 'Type'],
            style: { head: ['cyan'] },
          });

          results.success.forEach(issue => {
            table.push([issue.key, issue.summary, issue.issueType]);
          });

          console.log(table.toString());
        }

        // Save results if requested
        if (options.output) {
          const output = {
            created: results.success,
            failed: results.failed,
            timestamp: new Date().toISOString(),
          };
          writeFileSync(options.output, JSON.stringify(output, null, 2));
          Logger.success(`Results saved to ${options.output}`);
        }

        if (Logger.isJsonMode()) {
          ErrorHandler.success({
            created: results.success.length,
            failed: results.failed.length,
            issues: results.success.map(i => ({ key: i.key, summary: i.summary })),
          });
        }

      } catch (error) {
        ErrorHandler.handle(error);
      }
    });

  batch
    .command('parse')
    .description('Parse a markdown file and preview extracted issues')
    .argument('<file>', 'Markdown file to parse')
    .option('--output <file>', 'Save parsed issues to JSON file')
    .option('--format <format>', 'Output format (table|json)', 'table')
    .action(async (file, options) => {
      try {
        if (!file.endsWith('.md') && !file.endsWith('.markdown')) {
          throw new Error('File must be a markdown file (.md or .markdown)');
        }

        Logger.info('Parsing markdown file...');
        const issues = MarkdownParser.parseFile(file);

        if (issues.length === 0) {
          Logger.warning('No issues found in file');
          return;
        }

        Logger.success(`Found ${issues.length} potential issues\n`);

        if (options.format === 'json' || Logger.isJsonMode()) {
          console.log(JSON.stringify(issues, null, 2));
        } else {
          displayIssuesTable(issues);
        }

        if (options.output) {
          writeFileSync(options.output, JSON.stringify(issues, null, 2));
          Logger.success(`\nParsed issues saved to ${options.output}`);
        }

      } catch (error) {
        ErrorHandler.handle(error);
      }
    });

  return batch;
}

/**
 * Interactive review of issues before creation
 */
async function interactiveReview(issues: ParsedIssue[]): Promise<ParsedIssue[]> {
  const reviewed: ParsedIssue[] = [];

  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    
    console.log(`\n📝 Issue ${i + 1}/${issues.length}`);
    console.log(`Summary: ${issue.summary}`);
    console.log(`Type: ${issue.issueType}`);
    console.log(`Priority: ${issue.priority || 'Medium'}`);
    console.log(`Labels: ${issue.labels?.join(', ') || 'none'}`);
    console.log(`Description: ${issue.description.substring(0, 100)}...`);

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: 'Create as-is', value: 'create' },
          { name: 'Edit and create', value: 'edit' },
          { name: 'Skip this issue', value: 'skip' },
          { name: 'Skip remaining issues', value: 'skip-all' },
        ],
      },
    ]);

    if (action === 'skip-all') {
      break;
    }

    if (action === 'skip') {
      continue;
    }

    if (action === 'edit') {
      const edited = await editIssue(issue);
      reviewed.push(edited);
    } else {
      reviewed.push(issue);
    }
  }

  return reviewed;
}

/**
 * Edit an issue interactively
 */
async function editIssue(issue: ParsedIssue): Promise<ParsedIssue> {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'summary',
      message: 'Summary:',
      default: issue.summary,
    },
    {
      type: 'list',
      name: 'issueType',
      message: 'Issue Type:',
      choices: ['Task', 'Bug', 'Story', 'Epic', 'Subtask'],
      default: issue.issueType,
    },
    {
      type: 'list',
      name: 'priority',
      message: 'Priority:',
      choices: ['Highest', 'High', 'Medium', 'Low', 'Lowest'],
      default: issue.priority || 'Medium',
    },
    {
      type: 'input',
      name: 'labels',
      message: 'Labels (comma-separated):',
      default: issue.labels?.join(', ') || '',
    },
    {
      type: 'editor',
      name: 'description',
      message: 'Description:',
      default: issue.description,
    },
  ]);

  return {
    ...issue,
    summary: answers.summary,
    issueType: answers.issueType,
    priority: answers.priority,
    labels: answers.labels ? answers.labels.split(',').map((l: string) => l.trim()) : [],
    description: answers.description,
  };
}

/**
 * Create issues in Jira
 */
async function createIssues(
  client: CoreClient,
  issues: ParsedIssue[]
): Promise<{ success: any[]; failed: any[] }> {
  const results = {
    success: [] as any[],
    failed: [] as any[],
  };

  const total = issues.length;
  let current = 0;

  for (const issue of issues) {
    current++;
    Logger.startSpinner(`Creating issue ${current}/${total}: ${issue.summary}`);
    
    try {
      const created = await client.createIssue({
        summary: issue.summary,
        description: issue.description,
        issueType: issue.issueType,
        priority: issue.priority,
        labels: issue.labels,
        assignee: issue.assignee,
        parent: issue.parent,
      });

      Logger.stopSpinner(true, `Created ${created.key}`);
      
      results.success.push({
        key: created.key,
        summary: issue.summary,
        issueType: issue.issueType,
      });
    } catch (error: any) {
      Logger.stopSpinner(false, `Failed: ${error.message}`);
      
      results.failed.push({
        summary: issue.summary,
        error: error.message,
      });
    }
  }

  return results;
}

/**
 * Display issues in a table
 */
function displayIssuesTable(issues: ParsedIssue[]): void {
  const table = new Table({
    head: ['#', 'Summary', 'Type', 'Priority', 'Labels'],
    style: { head: ['cyan'] },
    colWidths: [5, 50, 10, 10, 20],
    wordWrap: true,
  });

  issues.forEach((issue, index) => {
    table.push([
      (index + 1).toString(),
      issue.summary,
      issue.issueType,
      issue.priority || 'Medium',
      issue.labels?.join(', ') || '',
    ]);
  });

  console.log(table.toString());
}