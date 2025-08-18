import { Command } from 'commander';
import { ConfigManager } from '../config/jira.js';
import { CoreClient } from '../clients/core.js';
import { Logger } from '../utils/logger.js';
import { ErrorHandler } from '../utils/error-handler.js';
import { Formatter } from '../utils/formatter.js';

interface SprintOptions {
  next?: boolean;
  name?: string;
  board?: string;
  fields?: string;
}

interface Sprint {
  id: number;
  name: string;
  state: 'active' | 'closed' | 'future';
  startDate?: string;
  endDate?: string;
  completeDate?: string;
  goal?: string;
}


export function createSprintCommand(): Command {
  const sprint = new Command('sprint')
    .description('View sprint information and issues')
    .option('--next', 'Show next sprint instead of current')
    .option('--name <name>', 'Show specific sprint by name')
    .option('--board <nameOrId>', 'Specify board (defaults to JIRA_BOARD env var)')
    .option('--fields <fields>', 'Comma-separated list of fields to return for issues')
    .action(async (options: SprintOptions) => {
      try {
        const configManager = new ConfigManager();
        const config = await configManager.getConfig();
        const client = new CoreClient(config);

        // Determine board ID
        let boardId: number;
        const boardIdentifier = options.board || process.env.JIRA_BOARD || config.board;
        
        if (!boardIdentifier) {
          // Try to find a board for the project
          Logger.startSpinner(`Finding board for project ${config.project}...`);
          const boards = await client.getBoards(config.project);
          
          if (boards.length === 0) {
            throw new Error(`No boards found for project ${config.project}. Use --board to specify one.`);
          }
          
          boardId = boards[0].id;
          Logger.stopSpinner(true);
          Logger.info(`Using board: ${boards[0].name}`);
        } else if (/^\d+$/.test(boardIdentifier)) {
          boardId = parseInt(boardIdentifier);
        } else {
          // Search for board by name
          Logger.startSpinner(`Finding board "${boardIdentifier}"...`);
          const boards = await client.getBoardByName(boardIdentifier);
          
          if (!boards) {
            throw new Error(`Board "${boardIdentifier}" not found`);
          }
          
          boardId = boards.id;
          Logger.stopSpinner(true);
        }

        // Get sprints for the board
        Logger.startSpinner('Fetching sprints...');
        const sprints = await client.getSprints(boardId);
        Logger.stopSpinner(true);

        let targetSprint: Sprint | undefined;
        
        if (options.name) {
          // Find sprint by name
          targetSprint = sprints.find(s => 
            s.name.toLowerCase() === options.name!.toLowerCase()
          );
          
          if (!targetSprint) {
            throw new Error(`Sprint "${options.name}" not found`);
          }
        } else if (options.next) {
          // Find next sprint
          targetSprint = sprints.find(s => s.state === 'future');
          
          if (!targetSprint) {
            throw new Error('No future sprint found');
          }
        } else {
          // Find current sprint
          targetSprint = sprints.find(s => s.state === 'active');
          
          if (!targetSprint) {
            throw new Error('No active sprint found');
          }
        }

        // Get issues in the sprint
        Logger.startSpinner(`Fetching issues for sprint "${targetSprint.name}"...`);
        const issues = await client.getSprintIssues(
          boardId, 
          targetSprint.id,
          options.fields?.split(',')
        );
        Logger.stopSpinner(true);

        // Calculate sprint metrics
        const metrics = calculateSprintMetrics(issues);

        if (Logger.isJsonMode()) {
          ErrorHandler.success({
            sprint: {
              id: targetSprint.id,
              name: targetSprint.name,
              state: targetSprint.state,
              startDate: targetSprint.startDate,
              endDate: targetSprint.endDate,
              goal: targetSprint.goal,
            },
            metrics,
            issues: Formatter.formatJson(issues)
          });
        } else {
          // Display sprint info
          console.log('\n' + Formatter.formatSprintHeader(targetSprint));
          
          // Display metrics
          console.log('\n📊 Sprint Metrics:');
          console.log(`  Total Issues: ${metrics.total}`);
          console.log(`  Completed: ${metrics.completed} (${metrics.completionRate}%)`);
          console.log(`  In Progress: ${metrics.inProgress}`);
          console.log(`  To Do: ${metrics.todo}`);
          
          if (targetSprint.state === 'active' && targetSprint.startDate && targetSprint.endDate) {
            const progress = calculateTimeProgress(targetSprint.startDate, targetSprint.endDate);
            console.log(`  Time Progress: ${progress}%`);
          }
          
          // Display issues
          if (issues.length > 0) {
            console.log('\n📋 Issues:');
            console.log(Formatter.formatIssuesTable(issues));
          } else {
            Logger.info('\nNo issues in this sprint');
          }
        }
      } catch (error) {
        ErrorHandler.handle(error);
      }
    });

  return sprint;
}

// Helper functions
function calculateSprintMetrics(issues: any[]): any {
    const total = issues.length;
    const completed = issues.filter(i => 
      i.fields.status.statusCategory.key === 'done'
    ).length;
    const inProgress = issues.filter(i => 
      i.fields.status.statusCategory.key === 'indeterminate'
    ).length;
    const todo = issues.filter(i => 
      i.fields.status.statusCategory.key === 'new'
    ).length;
    
    return {
      total,
      completed,
      inProgress,
      todo,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0
    };
}

function calculateTimeProgress(startDate: string, endDate: string): number {
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    const now = Date.now();
    
    if (now < start) return 0;
    if (now > end) return 100;
    
    const total = end - start;
    const elapsed = now - start;
    
    return Math.round((elapsed / total) * 100);
}