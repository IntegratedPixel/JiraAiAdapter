import { readFileSync } from 'fs';
import { parse } from 'csv-parse/sync';
import { ParsedIssue } from './markdown-parser.js';

export class CSVParser {
  /**
   * Parse CSV file and convert to ParsedIssue format
   */
  static parseFile(filePath: string): ParsedIssue[] {
    const content = readFileSync(filePath, 'utf-8');
    return this.parseContent(content);
  }

  /**
   * Parse CSV content and convert to ParsedIssue format
   */
  static parseContent(content: string): ParsedIssue[] {
    try {
      const records = parse(content, {
        columns: true, // Use first row as column headers
        skip_empty_lines: true,
        trim: true,
        cast: true,
      });

      return records.map((record: any) => this.mapRecordToIssue(record));
    } catch (error) {
      throw new Error(`Failed to parse CSV: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Map CSV record to ParsedIssue
   */
  private static mapRecordToIssue(record: any): ParsedIssue {
    // Common CSV column mappings (case-insensitive)
    const columnMap = this.createColumnMap(record);

    const issue: ParsedIssue = {
      summary: this.getColumnValue(columnMap, ['summary', 'title', 'subject']) || 'Untitled Issue',
      description: this.getColumnValue(columnMap, ['description', 'desc', 'details', 'body']) || '',
      issueType: this.getColumnValue(columnMap, ['type', 'issuetype', 'issue_type', 'kind']) || 'Task',
      priority: this.getColumnValue(columnMap, ['priority', 'pri']) || 'Medium',
    };

    // Handle optional fields
    const labels = this.getColumnValue(columnMap, ['labels', 'tags', 'categories']);
    if (labels) {
      issue.labels = this.parseArray(labels);
    }

    const components = this.getColumnValue(columnMap, ['components', 'component', 'comp']);
    if (components) {
      issue.components = this.parseArray(components);
    }

    const assignee = this.getColumnValue(columnMap, ['assignee', 'assigned_to', 'owner']);
    if (assignee) {
      issue.assignee = assignee;
    }

    const parent = this.getColumnValue(columnMap, ['parent', 'parent_key', 'epic']);
    if (parent) {
      issue.parent = parent;
    }

    // Handle story points
    const storyPoints = this.getColumnValue(columnMap, ['story_points', 'storypoints', 'points', 'sp']);
    if (storyPoints !== null && storyPoints !== undefined && storyPoints !== '') {
      const points = parseFloat(storyPoints);
      if (!isNaN(points) && points >= 0) {
        issue.storyPoints = points;
      }
    }

    return issue;
  }

  /**
   * Create a case-insensitive column mapping
   */
  private static createColumnMap(record: any): Map<string, any> {
    const map = new Map();
    Object.keys(record).forEach(key => {
      map.set(key.toLowerCase().replace(/\s+/g, '_'), record[key]);
    });
    return map;
  }

  /**
   * Get value from column map using multiple possible column names
   */
  private static getColumnValue(columnMap: Map<string, any>, possibleNames: string[]): any {
    for (const name of possibleNames) {
      const normalizedName = name.toLowerCase().replace(/\s+/g, '_');
      if (columnMap.has(normalizedName)) {
        const value = columnMap.get(normalizedName);
        return value === null || value === undefined || value === '' ? null : value;
      }
    }
    return null;
  }

  /**
   * Parse comma or pipe separated values into array
   */
  private static parseArray(value: string): string[] {
    if (!value || typeof value !== 'string') {
      return [];
    }

    // Handle comma or pipe separated values
    const separator = value.includes('|') ? '|' : ',';
    return value
      .split(separator)
      .map(item => item.trim())
      .filter(item => item.length > 0);
  }

  /**
   * Generate a sample CSV template
   */
  static generateTemplate(): string {
    return `Summary,Type,Priority,Description,Labels,Assignee,Story Points,Components,Parent
Fix login bug,Bug,High,"User cannot login after recent update",authentication,john@example.com,3,frontend,
Add dark mode toggle,Story,Medium,"Users have requested a dark mode option for the application",ui|ux,jane@example.com,5,frontend,PROJ-100
Update API documentation,Task,Low,"API documentation needs to be updated with latest endpoints",documentation,bob@example.com,2,backend,
Performance optimization,Task,High,"Application is running slowly during peak hours",performance|optimization,alice@example.com,8,backend|infrastructure,`;
  }
}