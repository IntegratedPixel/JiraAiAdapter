import { readFileSync } from 'fs';

export interface ParsedIssue {
  summary: string;
  description: string;
  issueType: string;
  labels?: string[];
  priority?: string;
  components?: string[];
  assignee?: string;
  originalText?: string;
}

export interface MarkdownParseOptions {
  // Patterns to identify issues
  taskPattern?: RegExp;
  bugPattern?: RegExp;
  featurePattern?: RegExp;
  
  // Field extraction
  extractLabels?: boolean;
  extractPriority?: boolean;
  
  // Section mapping
  sectionMapping?: {
    [key: string]: string; // e.g., "## Bugs" -> issueType: "Bug"
  };
}

export class MarkdownParser {
  private static readonly DEFAULT_PATTERNS = {
    task: /^[\s]*[-*]\s*\[[ ]?\]\s*(.+)$/gm,  // Unchecked checkboxes
    bug: /^[\s]*[-*]\s*(?:BUG|Bug|bug|🐛|🐞)\s*:?\s*(.+)$/gm,
    feature: /^[\s]*[-*]\s*(?:FEATURE|Feature|feature|✨|🚀)\s*:?\s*(.+)$/gm,
    todo: /^[\s]*[-*]\s*(?:TODO|Todo|todo)\s*:?\s*(.+)$/gm,
  };

  private static readonly PRIORITY_PATTERNS = {
    highest: /(?:URGENT|CRITICAL|BLOCKER|P0|🔴|!!!)/i,
    high: /(?:HIGH|IMPORTANT|P1|🟠|!!)/i,
    medium: /(?:MEDIUM|NORMAL|P2|🟡|!)/i,
    low: /(?:LOW|MINOR|P3|🟢)/i,
    lowest: /(?:TRIVIAL|P4|🔵)/i,
  };

  /**
   * Parse a markdown file and extract potential Jira issues
   */
  static parseFile(filePath: string, options: MarkdownParseOptions = {}): ParsedIssue[] {
    const content = readFileSync(filePath, 'utf-8');
    return this.parseContent(content, options);
  }

  /**
   * Parse markdown content and extract potential Jira issues
   */
  static parseContent(content: string, options: MarkdownParseOptions = {}): ParsedIssue[] {
    const issues: ParsedIssue[] = [];
    
    // Parse by sections
    const sections = this.parseSections(content);
    
    for (const section of sections) {
      const sectionIssues = this.extractIssuesFromSection(section, options);
      issues.push(...sectionIssues);
    }
    
    // Also parse loose items not in sections
    const looseIssues = this.extractLooseItems(content, options);
    issues.push(...looseIssues);
    
    return this.deduplicateIssues(issues);
  }

  /**
   * Parse markdown into sections based on headers
   */
  private static parseSections(content: string): Array<{header: string; content: string; level: number}> {
    const sections: Array<{header: string; content: string; level: number}> = [];
    const lines = content.split('\n');
    let currentSection: {header: string; content: string; level: number} | null = null;
    
    for (const line of lines) {
      const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
      
      if (headerMatch) {
        if (currentSection) {
          sections.push(currentSection);
        }
        currentSection = {
          header: headerMatch[2],
          content: '',
          level: headerMatch[1].length,
        };
      } else if (currentSection) {
        currentSection.content += line + '\n';
      }
    }
    
    if (currentSection) {
      sections.push(currentSection);
    }
    
    return sections;
  }

  /**
   * Extract issues from a specific section
   */
  private static extractIssuesFromSection(
    section: {header: string; content: string; level: number},
    options: MarkdownParseOptions
  ): ParsedIssue[] {
    const issues: ParsedIssue[] = [];
    const issueType = this.determineIssueType(section.header, options);
    
    // Extract checklist items
    const checklistPattern = /^[\s]*[-*]\s*\[[ xX]?\]\s*(.+)$/gm;
    let match;
    
    while ((match = checklistPattern.exec(section.content)) !== null) {
      const summary = match[1].trim();
      if (summary) {
        issues.push({
          summary: this.cleanSummary(summary),
          description: `From section: ${section.header}\n\nOriginal: ${match[0]}`,
          issueType,
          labels: this.extractLabels(summary, section.header),
          priority: this.extractPriority(summary),
          originalText: match[0],
        });
      }
    }
    
    // Extract bullet points that look like tasks
    const bulletPattern = /^[\s]*[-*]\s+(?!\[)(.+)$/gm;
    
    while ((match = bulletPattern.exec(section.content)) !== null) {
      const text = match[1].trim();
      if (this.looksLikeIssue(text)) {
        issues.push({
          summary: this.cleanSummary(text),
          description: `From section: ${section.header}\n\nOriginal: ${match[0]}`,
          issueType,
          labels: this.extractLabels(text, section.header),
          priority: this.extractPriority(text),
          originalText: match[0],
        });
      }
    }
    
    return issues;
  }

  /**
   * Extract loose items not in sections
   */
  private static extractLooseItems(content: string, options: MarkdownParseOptions): ParsedIssue[] {
    const issues: ParsedIssue[] = [];
    
    // Look for TODO/FIXME/BUG comments
    const patterns = {
      task: options.taskPattern || this.DEFAULT_PATTERNS.task,
      bug: options.bugPattern || this.DEFAULT_PATTERNS.bug,
      feature: options.featurePattern || this.DEFAULT_PATTERNS.feature,
      todo: this.DEFAULT_PATTERNS.todo,
    };
    
    for (const [type, pattern] of Object.entries(patterns)) {
      const issueType = type === 'bug' ? 'Bug' : type === 'feature' ? 'Story' : 'Task';
      let match;
      
      while ((match = pattern.exec(content)) !== null) {
        const summary = match[1]?.trim() || match[0]?.trim();
        if (summary) {
          issues.push({
            summary: this.cleanSummary(summary),
            description: `Extracted ${type} from markdown\n\nOriginal: ${match[0]}`,
            issueType,
            labels: this.extractLabels(summary),
            priority: this.extractPriority(summary),
            originalText: match[0],
          });
        }
      }
    }
    
    return issues;
  }

  /**
   * Determine issue type based on section header
   */
  private static determineIssueType(header: string, options: MarkdownParseOptions): string {
    // Check custom mapping first
    if (options.sectionMapping) {
      for (const [pattern, type] of Object.entries(options.sectionMapping)) {
        if (header.toLowerCase().includes(pattern.toLowerCase())) {
          return type;
        }
      }
    }
    
    // Default mappings
    const headerLower = header.toLowerCase();
    if (headerLower.includes('bug') || headerLower.includes('issue')) {
      return 'Bug';
    }
    if (headerLower.includes('feature') || headerLower.includes('enhancement')) {
      return 'Story';
    }
    if (headerLower.includes('task') || headerLower.includes('todo')) {
      return 'Task';
    }
    
    return 'Task'; // Default
  }

  /**
   * Check if text looks like an issue
   */
  private static looksLikeIssue(text: string): boolean {
    // Check for action words
    const actionWords = /^(add|create|implement|fix|update|remove|delete|improve|refactor|test|document|investigate)/i;
    
    // Check for keywords
    const keywords = /(TODO|FIXME|BUG|FEATURE|TASK|ISSUE)/i;
    
    // Must start with action word or contain keyword
    return actionWords.test(text) || keywords.test(text);
  }

  /**
   * Clean summary text
   */
  private static cleanSummary(summary: string): string {
    // Remove priority indicators
    let cleaned = summary.replace(/^(URGENT|HIGH|MEDIUM|LOW|P[0-4])\s*:?\s*/i, '');
    
    // Remove type indicators
    cleaned = cleaned.replace(/^(BUG|FEATURE|TASK|TODO|FIXME)\s*:?\s*/i, '');
    
    // Remove emoji indicators
    cleaned = cleaned.replace(/^[🐛🐞✨🚀🔴🟠🟡🟢🔵💡📝⚠️]\s*/, '');
    
    // Remove markdown formatting
    cleaned = cleaned.replace(/[*_`]/g, '');
    
    // Trim and capitalize first letter
    cleaned = cleaned.trim();
    if (cleaned.length > 0) {
      cleaned = cleaned[0].toUpperCase() + cleaned.slice(1);
    }
    
    return cleaned;
  }

  /**
   * Extract labels from text
   */
  private static extractLabels(text: string, sectionHeader?: string): string[] {
    const labels: string[] = [];
    
    // Extract hashtags as labels
    const hashtags = text.match(/#(\w+)/g);
    if (hashtags) {
      labels.push(...hashtags.map(tag => tag.slice(1).toLowerCase()));
    }
    
    // Extract [label] patterns
    const bracketLabels = text.match(/\[([^\]]+)\]/g);
    if (bracketLabels) {
      labels.push(...bracketLabels.map(label => 
        label.slice(1, -1).toLowerCase().replace(/\s+/g, '-')
      ));
    }
    
    // Add section as label if provided
    if (sectionHeader) {
      const sectionLabel = sectionHeader.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      if (sectionLabel && sectionLabel.length > 1) {
        labels.push(sectionLabel);
      }
    }
    
    // Add common labels based on content
    if (/\b(ui|ux|frontend|front-end)\b/i.test(text)) labels.push('frontend');
    if (/\b(backend|back-end|api|server)\b/i.test(text)) labels.push('backend');
    if (/\b(test|testing|qa)\b/i.test(text)) labels.push('testing');
    if (/\b(doc|documentation|docs)\b/i.test(text)) labels.push('documentation');
    
    return [...new Set(labels)]; // Remove duplicates
  }

  /**
   * Extract priority from text
   */
  private static extractPriority(text: string): string {
    for (const [priority, pattern] of Object.entries(this.PRIORITY_PATTERNS)) {
      if (pattern.test(text)) {
        return priority.charAt(0).toUpperCase() + priority.slice(1);
      }
    }
    return 'Medium'; // Default
  }

  /**
   * Remove duplicate issues
   */
  private static deduplicateIssues(issues: ParsedIssue[]): ParsedIssue[] {
    const seen = new Set<string>();
    return issues.filter(issue => {
      const key = issue.summary.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Convert parsed issues to Jira creation format
   */
  static toJiraFormat(issues: ParsedIssue[]): Array<any> {
    return issues.map(issue => ({
      fields: {
        summary: issue.summary,
        description: issue.description,
        issuetype: { name: issue.issueType },
        priority: issue.priority ? { name: issue.priority } : undefined,
        labels: issue.labels,
        components: issue.components?.map(name => ({ name })),
      },
    }));
  }
}