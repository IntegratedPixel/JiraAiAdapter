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
    .description('Create a new Jira issue with support for all common fields including Epic linking, story points, labels, components, and subtasks. Use templates for standardized issue creation.')
    .option('-t, --type <type>', 'Issue type (Bug, Story, Task, etc.)')
    .option('-s, --summary <summary>', 'Issue summary')
    .option('-d, --description <description>', 'Issue description')
    .option('--description-file <file>', 'Read description from file')
    .option('-p, --priority <priority>', 'Priority - if available in project (Highest, High, Medium, Low, Lowest)')
    .option('--story-points <number>', 'Story points (numeric value)')
    .option('-l, --labels <labels>', 'Comma-separated labels')
    .option('-c, --components <components>', 'Comma-separated components')
    .option('-a, --assignee <assignee>', 'Assignee email or username')
    .option('--parent <issueKey>', 'Parent issue key (required for Sub-task type)')
    .option('--epic <epicKey>', 'Link to Epic by issue key (e.g., PROJ-123). Creates parent-child relationship for Agile workflows.')
    .option('--project <key>', 'Create in specific project (overrides default)')
    .option('--board <name>', 'Specify board name (overrides default board)')
    .option('--template <template>', 'Use pre-defined template: bug, feature, or task for standardized issue creation')
    .option('--dry-run', 'Preview the issue without creating it - shows what would be created')
    .action(async (options) => {
      try {
        const configManager = new ConfigManager();
        // Apply command-line project overrides
        const configOverrides = {
          project: options.project,
          board: options.board,
        };
        const config = await configManager.getConfig(configOverrides);
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

        if (options.storyPoints !== undefined) {
          const storyPoints = parseFloat(options.storyPoints);
          if (isNaN(storyPoints) || storyPoints < 0) {
            throw new Error('Story points must be a non-negative number');
          }
          issueData.storyPoints = storyPoints;
        }

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

        if (options.parent) {
          issueData.parent = options.parent;
          // If parent is provided but type is not Sub-task, warn the user
          if (issueData.issueType && !issueData.issueType.toLowerCase().includes('sub')) {
            Logger.warning('Parent specified but issue type is not Sub-task. Setting type to Sub-task.');
            issueData.issueType = 'Sub-task';
          }
        }

        if (options.epic) {
          issueData.epic = options.epic;
        }

        // Check if any non-interactive options were provided
        const hasCommandLineArgs = options.type || options.summary || options.description || 
                                   options.descriptionFile || options.priority || options.labels || 
                                   options.components || options.assignee || options.storyPoints;
        
        // If command line args provided but missing required fields, error out instead of going interactive
        if (hasCommandLineArgs && (!issueData.summary || !issueData.issueType)) {
          const missing = [];
          if (!issueData.summary) missing.push('summary');
          if (!issueData.issueType) missing.push('type');
          throw new Error(`Missing required fields: ${missing.join(', ')}. Use --summary and --type, or run without arguments for interactive mode.`);
        }
        
        // Interactive mode if missing required fields AND no command line args provided
        if ((!issueData.summary || !issueData.issueType) && !hasCommandLineArgs && !options.template) {
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

        // Validate issue type against project's available types
        if (issueData.issueType) {
          Logger.startSpinner('Validating issue type...');
          try {
            const availableTypes = await client.getProjectIssueTypes(config.project);
            const validType = availableTypes.find(type => 
              type.name.toLowerCase() === issueData.issueType.toLowerCase()
            );
            
            if (!validType) {
              Logger.stopSpinner(false);
              const typeNames = availableTypes.map(type => type.name).sort();
              throw new Error(
                `Invalid issue type "${issueData.issueType}" for project ${config.project}.\n` +
                `Available types: ${typeNames.join(', ')}\n` +
                `\nTip: Use 'jira types' to see all available issue types for this project.`
              );
            }
            Logger.stopSpinner(true);
          } catch (validationError: any) {
            Logger.stopSpinner(false);
            throw validationError;
          }
        }

        // Create the issue
        Logger.startSpinner('Creating issue...');

        const createdIssue = await client.createIssue({
          summary: issueData.summary,
          description: issueData.description,
          issueType: issueData.issueType,
          priority: issueData.priority,
          storyPoints: issueData.storyPoints,
          labels: issueData.labels,
          components: issueData.components,
          assignee: issueData.assignee,
          parent: issueData.parent,
          epic: issueData.epic,
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