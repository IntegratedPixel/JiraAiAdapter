import Table from 'cli-table3';
import chalk from 'chalk';
import { JiraIssue } from '../types/jira.js';
import { ADFBuilder } from './adf.js';

export class Formatter {
  /**
   * Format issues as a table
   */
  static formatIssuesTable(issues: JiraIssue[]): string {
    if (issues.length === 0) {
      return 'No issues found';
    }

    const table = new Table({
      head: ['Key', 'Type', 'Status', 'Priority', 'Points', 'Summary', 'Assignee'],
      colWidths: [12, 10, 15, 10, 8, 35, 18],
      wordWrap: true,
      style: {
        head: ['cyan'],
      },
    });

    for (const issue of issues) {
      const fields = issue.fields;
      
      table.push([
        chalk.blue(issue.key),
        fields.issuetype?.name || '-',
        this.formatStatus(fields.status),
        this.formatPriority(fields.priority),
        this.formatStoryPoints(fields),
        this.truncate(fields.summary, 33),
        fields.assignee?.displayName || 'Unassigned',
      ]);
    }

    return table.toString();
  }

  /**
   * Format a single issue for detailed view
   */
  static formatIssueDetail(issue: JiraIssue): string {
    const fields = issue.fields;
    const lines: string[] = [];

    lines.push(chalk.bold.blue(`${issue.key}: ${fields.summary}`));
    lines.push('');
    
    lines.push(`${chalk.bold('Type:')} ${fields.issuetype?.name || '-'}`);
    lines.push(`${chalk.bold('Status:')} ${this.formatStatus(fields.status)}`);
    lines.push(`${chalk.bold('Priority:')} ${this.formatPriority(fields.priority)}`);
    
    const storyPoints = this.getStoryPoints(fields);
    if (storyPoints !== null) {
      lines.push(`${chalk.bold('Story Points:')} ${storyPoints}`);
    }
    
    lines.push(`${chalk.bold('Reporter:')} ${fields.reporter?.displayName || '-'}`);
    lines.push(`${chalk.bold('Assignee:')} ${fields.assignee?.displayName || 'Unassigned'}`);
    
    // Show parent/epic information
    if (fields.parent) {
      const parentSummary = fields.parent.fields?.summary || fields.parent.key;
      const parentType = fields.parent.fields?.issuetype?.name || 'Issue';
      lines.push(`${chalk.bold('Parent:')} ${fields.parent.key} (${parentType}) - ${parentSummary}`);
    }
    
    if (fields.labels && fields.labels.length > 0) {
      lines.push(`${chalk.bold('Labels:')} ${fields.labels.join(', ')}`);
    }
    
    if (fields.components && fields.components.length > 0) {
      lines.push(`${chalk.bold('Components:')} ${fields.components.map(c => c.name).join(', ')}`);
    }
    
    lines.push(`${chalk.bold('Created:')} ${this.formatDate(fields.created)}`);
    lines.push(`${chalk.bold('Updated:')} ${this.formatDate(fields.updated)}`);
    
    if (fields.description) {
      lines.push('');
      lines.push(chalk.bold('Description:'));
      lines.push(this.formatDescription(fields.description));
    }

    return lines.join('\n');
  }

  /**
   * Format comments for display
   */
  static formatComments(comments: any[]): string {
    if (!comments || comments.length === 0) {
      return 'No comments';
    }

    const lines: string[] = [];
    
    for (const comment of comments) {
      lines.push(chalk.gray('─'.repeat(60)));
      lines.push(`${chalk.bold(comment.author?.displayName || 'Unknown')} - ${this.formatDate(comment.created)}`);
      lines.push(this.formatDescription(comment.body));
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Format status with color
   */
  private static formatStatus(status: any): string {
    if (!status) return '-';
    
    const name = status.name;
    const category = status.statusCategory?.name?.toLowerCase();
    
    switch (category) {
      case 'done':
        return chalk.green(name);
      case 'in progress':
        return chalk.yellow(name);
      case 'to do':
        return chalk.gray(name);
      default:
        return name;
    }
  }

  /**
   * Format priority with color
   */
  private static formatPriority(priority: any): string {
    if (!priority) return '-';
    
    const name = priority.name;
    
    switch (name.toLowerCase()) {
      case 'highest':
      case 'blocker':
        return chalk.red(name);
      case 'high':
      case 'critical':
        return chalk.redBright(name);
      case 'medium':
      case 'major':
        return chalk.yellow(name);
      case 'low':
      case 'minor':
        return chalk.green(name);
      case 'lowest':
      case 'trivial':
        return chalk.gray(name);
      default:
        return name;
    }
  }

  /**
   * Format description from ADF to plain text
   */
  static formatDescription(description: any): string {
    if (!description) return '';
    
    if (typeof description === 'string') {
      return description;
    }
    
    // Convert ADF to text
    return ADFBuilder.adfToText(description);
  }

  /**
   * Format date to readable string
   */
  private static formatDate(dateStr: string): string {
    if (!dateStr) return '-';
    
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor(diff / (1000 * 60));
    
    if (minutes < 60) {
      return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    } else if (hours < 24) {
      return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    } else if (days < 30) {
      return `${days} day${days !== 1 ? 's' : ''} ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  /**
   * Truncate text to specified length
   */
  private static truncate(text: string, maxLength: number): string {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  /**
   * Format JSON output for AI consumption
   */
  static formatJson(data: any): any {
    // Clean up the data for JSON output
    if (Array.isArray(data)) {
      return data.map(item => this.cleanJsonItem(item));
    }
    return this.cleanJsonItem(data);
  }

  private static cleanJsonItem(item: any): any {
    if (!item) return item;
    
    // If it's a Jira issue, extract key fields
    if (item.key && item.fields) {
      return {
        key: item.key,
        summary: item.fields.summary,
        status: item.fields.status?.name,
        type: item.fields.issuetype?.name,
        priority: item.fields.priority?.name,
        storyPoints: this.getStoryPoints(item.fields),
        assignee: item.fields.assignee?.displayName,
        reporter: item.fields.reporter?.displayName,
        created: item.fields.created,
        updated: item.fields.updated,
        description: this.formatDescription(item.fields.description),
        labels: item.fields.labels,
        components: item.fields.components?.map((c: any) => c.name),
      };
    }
    
    return item;
  }

  /**
   * Get story points from issue fields
   */
  private static getStoryPoints(fields: any): number | null {
    // Story points can be in various custom fields, commonly:
    // - customfield_10016 (common default)
    // - customfield_10002 
    // - story_point_estimate
    // We'll check common ones and return the first found
    const storyPointFields = [
      'customfield_10016',
      'customfield_10002', 
      'customfield_10004',
      'customfield_10008',
      'story_point_estimate',
      'storyPoints'
    ];

    for (const field of storyPointFields) {
      if (fields[field] !== undefined && fields[field] !== null) {
        const value = parseFloat(fields[field]);
        if (!isNaN(value)) {
          return value;
        }
      }
    }

    return null;
  }

  /**
   * Format story points for table display
   */
  private static formatStoryPoints(fields: any): string {
    const points = this.getStoryPoints(fields);
    if (points === null) {
      return '-';
    }
    
    // Color code based on size (typical Fibonacci scale)
    if (points <= 1) {
      return chalk.green(points.toString());
    } else if (points <= 3) {
      return chalk.blue(points.toString());
    } else if (points <= 8) {
      return chalk.yellow(points.toString());
    } else {
      return chalk.red(points.toString());
    }
  }
}