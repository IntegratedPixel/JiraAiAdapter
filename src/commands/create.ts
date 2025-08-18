import { Command } from 'commander';
import inquirer from 'inquirer';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ConfigManager } from '../config/jira.js';
import { CoreClient } from '../clients/core.js';
import { Logger } from '../utils/logger.js';
import { ErrorHandler } from '../utils/error-handler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface Template {
  issueType: string;
  priority: string;
  template: {
    summary: string;
    description: string;
    labels?: string[];
    components?: string[];
  };
  prompts: Array<{
    name: string;
    message: string;
    type: string;
    required?: boolean;
    default?: string;
  }>;
}

export function createCreateCommand(): Command {
  const create = new Command('create')
    .description('Create a new issue (some fields may not be available depending on project configuration)')
    .option('-t, --type <type>', 'Issue type (Bug, Story, Task, etc.)')
    .option('-s, --summary <summary>', 'Issue summary')
    .option('-d, --description <description>', 'Issue description')
    .option('--description-file <file>', 'Read description from file')
    .option('-p, --priority <priority>', 'Priority - if available in project (Highest, High, Medium, Low, Lowest)')
    .option('-l, --labels <labels>', 'Comma-separated labels')
    .option('-c, --components <components>', 'Comma-separated components')
    .option('-a, --assignee <assignee>', 'Assignee email or username')
    .option('--template <template>', 'Use template (bug, feature, task)')
    .option('--dry-run', 'Preview the issue without creating it')
    .action(async (options) => {
      try {
        const configManager = new ConfigManager();
        const config = await configManager.getConfig();
        const client = new CoreClient(config);

        let issueData: any = {};

        // Load template if specified
        if (options.template) {
          const templatePath = join(__dirname, '..', 'templates', `${options.template}.json`);
          
          if (!existsSync(templatePath)) {
            throw new Error(`Template '${options.template}' not found. Available: bug, feature, task`);
          }

          const template: Template = JSON.parse(readFileSync(templatePath, 'utf-8'));
          
          // Interactive mode with template
          if (!options.summary) {
            const answers: any = {};
            
            for (const prompt of template.prompts) {
              const answer = await inquirer.prompt({
                type: prompt.type || 'input',
                name: prompt.name,
                message: prompt.message,
                default: prompt.default,
                validate: prompt.required ? (input: string) => input.length > 0 || 'This field is required' : undefined,
              } as any);
              answers[prompt.name] = answer[prompt.name];
            }

            // Process template with answers
            issueData.summary = template.template.summary.replace(/\{\{(\w+)\}\}/g, (_, key) => answers[key] || '');
            issueData.description = template.template.description.replace(/\{\{(\w+)\}\}/g, (_, key) => answers[key] || '');
            issueData.issueType = template.issueType;
            issueData.priority = template.priority;
            issueData.labels = template.template.labels || [];
            issueData.components = template.template.components || [];
          } else {
            // Use template defaults with command line overrides
            issueData = {
              issueType: template.issueType,
              priority: template.priority,
              labels: template.template.labels || [],
              components: template.template.components || [],
            };
          }
        }

        // Override with command line options
        if (options.type) issueData.issueType = options.type;
        if (options.summary) issueData.summary = options.summary;
        if (options.priority) issueData.priority = options.priority;

        if (options.description) {
          issueData.description = options.description;
        } else if (options.descriptionFile) {
          if (!existsSync(options.descriptionFile)) {
            throw new Error(`File not found: ${options.descriptionFile}`);
          }
          issueData.description = readFileSync(options.descriptionFile, 'utf-8');
        }

        if (options.labels) {
          issueData.labels = options.labels.split(',').map((l: string) => l.trim());
        }

        if (options.components) {
          issueData.components = options.components.split(',').map((c: string) => c.trim());
        }

        if (options.assignee) {
          issueData.assignee = options.assignee;
        }

        // Interactive mode if missing required fields
        if (!issueData.summary || !issueData.issueType) {
          const answers = await inquirer.prompt([
            {
              type: 'input',
              name: 'summary',
              message: 'Issue summary:',
              when: !issueData.summary,
              validate: (input) => input.length > 0 || 'Summary is required',
            },
            {
              type: 'list',
              name: 'issueType',
              message: 'Issue type:',
              choices: ['Bug', 'Story', 'Task', 'Epic', 'Sub-task'],
              when: !issueData.issueType,
            },
            {
              type: 'editor',
              name: 'description',
              message: 'Issue description (press Enter to open editor):',
              when: !issueData.description,
            },
            {
              type: 'list',
              name: 'priority',
              message: 'Priority:',
              choices: ['Highest', 'High', 'Medium', 'Low', 'Lowest'],
              default: 'Medium',
              when: !issueData.priority,
            },
          ]);

          Object.assign(issueData, answers);
        }

        // Set defaults
        if (!issueData.priority) issueData.priority = 'Medium';
        if (!issueData.description) issueData.description = '';

        // Dry run - just show what would be created
        if (options.dryRun) {
          Logger.info('Dry run mode - issue will not be created');
          Logger.info('\nIssue to be created:');
          console.log(JSON.stringify({
            project: config.project,
            ...issueData,
          }, null, 2));
          return;
        }

        // Create the issue
        Logger.startSpinner('Creating issue...');

        const createdIssue = await client.createIssue({
          summary: issueData.summary,
          description: issueData.description,
          issueType: issueData.issueType,
          priority: issueData.priority,
          labels: issueData.labels,
          components: issueData.components,
          assignee: issueData.assignee,
        });

        Logger.stopSpinner(true, `Issue ${createdIssue.key} created successfully!`);

        // Fetch the full issue details to get all fields
        const fullIssue = await client.getIssue(createdIssue.key);

        if (Logger.isJsonMode()) {
          ErrorHandler.success({
            key: fullIssue.key,
            url: `https://${config.host}/browse/${fullIssue.key}`,
            summary: fullIssue.fields.summary,
            type: fullIssue.fields.issuetype?.name,
            status: fullIssue.fields.status?.name,
          });
        } else {
          Logger.success(`\nIssue created: ${fullIssue.key}`);
          Logger.info(`Summary: ${fullIssue.fields.summary}`);
          Logger.info(`Type: ${fullIssue.fields.issuetype?.name}`);
          Logger.info(`Status: ${fullIssue.fields.status?.name}`);
          Logger.info(`URL: https://${config.host}/browse/${fullIssue.key}`);
        }
      } catch (error) {
        ErrorHandler.handle(error);
      }
    });

  return create;
}