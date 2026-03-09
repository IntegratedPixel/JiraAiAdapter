import { describe, it, expect } from 'vitest';
import { Formatter } from '../../../src/utils/formatter.js';

describe('Formatter', () => {
  describe('formatIssuesTable', () => {
    it('should return "No issues found" for empty array', () => {
      expect(Formatter.formatIssuesTable([])).toBe('No issues found');
    });

    it('should render a table with issues', () => {
      const issues = [
        {
          key: 'PROJ-1',
          fields: {
            issuetype: { name: 'Bug' },
            status: { name: 'Open', statusCategory: { name: 'To Do' } },
            priority: { name: 'High' },
            summary: 'Fix login',
            assignee: { displayName: 'Alice' },
          },
        },
      ] as any;
      const result = Formatter.formatIssuesTable(issues);
      expect(result).toContain('PROJ-1');
      expect(result).toContain('Bug');
      expect(result).toContain('Fix login');
      expect(result).toContain('Alice');
    });

    it('should handle missing assignee', () => {
      const issues = [
        {
          key: 'PROJ-2',
          fields: {
            issuetype: { name: 'Task' },
            status: { name: 'Done', statusCategory: { name: 'Done' } },
            priority: { name: 'Medium' },
            summary: 'Some task',
            assignee: null,
          },
        },
      ] as any;
      const result = Formatter.formatIssuesTable(issues);
      expect(result).toContain('Unassigned');
    });
  });

  describe('formatIssueDetail', () => {
    it('should format issue details with all fields', () => {
      const issue = {
        key: 'PROJ-5',
        fields: {
          summary: 'Detailed issue',
          issuetype: { name: 'Story' },
          status: { name: 'In Progress', statusCategory: { name: 'In Progress' } },
          priority: { name: 'Medium' },
          reporter: { displayName: 'Bob' },
          assignee: { displayName: 'Alice' },
          labels: ['backend', 'api'],
          components: [{ name: 'auth' }],
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
          description: 'A simple description',
        },
      } as any;
      const result = Formatter.formatIssueDetail(issue);
      expect(result).toContain('PROJ-5');
      expect(result).toContain('Detailed issue');
      expect(result).toContain('Story');
      expect(result).toContain('Bob');
      expect(result).toContain('Alice');
      expect(result).toContain('backend, api');
      expect(result).toContain('auth');
    });

    it('should show parent info when present', () => {
      const issue = {
        key: 'PROJ-6',
        fields: {
          summary: 'Sub-task',
          issuetype: { name: 'Sub-task' },
          status: { name: 'Open' },
          priority: { name: 'Low' },
          reporter: null,
          assignee: null,
          parent: {
            key: 'PROJ-1',
            fields: { summary: 'Parent epic', issuetype: { name: 'Epic' } },
          },
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        },
      } as any;
      const result = Formatter.formatIssueDetail(issue);
      expect(result).toContain('PROJ-1');
      expect(result).toContain('Epic');
      expect(result).toContain('Parent epic');
    });
  });

  describe('formatDescription', () => {
    it('should return empty string for null/undefined', () => {
      expect(Formatter.formatDescription(null)).toBe('');
      expect(Formatter.formatDescription(undefined)).toBe('');
    });

    it('should return string as-is', () => {
      expect(Formatter.formatDescription('plain text')).toBe('plain text');
    });

    it('should convert ADF to text', () => {
      const adf = {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Hello from ADF' }],
          },
        ],
      };
      const result = Formatter.formatDescription(adf);
      expect(result).toContain('Hello from ADF');
    });
  });

  describe('formatComments', () => {
    it('should return "No comments" for empty array', () => {
      expect(Formatter.formatComments([])).toBe('No comments');
    });

    it('should return "No comments" for null', () => {
      expect(Formatter.formatComments(null as any)).toBe('No comments');
    });

    it('should format comments with author and date', () => {
      const comments = [
        {
          author: { displayName: 'Alice' },
          body: 'Great work!',
          created: new Date().toISOString(),
        },
      ];
      const result = Formatter.formatComments(comments);
      expect(result).toContain('Alice');
    });
  });

  describe('formatJson', () => {
    it('should clean up Jira issue for JSON output', () => {
      const issue = {
        key: 'PROJ-10',
        fields: {
          summary: 'Test issue',
          status: { name: 'Open' },
          issuetype: { name: 'Bug' },
          priority: { name: 'High' },
          assignee: { displayName: 'Alice' },
          reporter: { displayName: 'Bob' },
          created: '2024-01-01T00:00:00Z',
          updated: '2024-01-02T00:00:00Z',
          description: 'Some description',
          labels: ['test'],
          components: [{ name: 'frontend' }],
        },
      };
      const result = Formatter.formatJson(issue);
      expect(result.key).toBe('PROJ-10');
      expect(result.summary).toBe('Test issue');
      expect(result.status).toBe('Open');
      expect(result.type).toBe('Bug');
      expect(result.priority).toBe('High');
      expect(result.assignee).toBe('Alice');
      expect(result.labels).toEqual(['test']);
      expect(result.components).toEqual(['frontend']);
    });

    it('should handle array of issues', () => {
      const issues = [
        { key: 'P-1', fields: { summary: 'A', status: { name: 'Open' } } },
        { key: 'P-2', fields: { summary: 'B', status: { name: 'Done' } } },
      ];
      const result = Formatter.formatJson(issues);
      expect(result).toHaveLength(2);
      expect(result[0].key).toBe('P-1');
      expect(result[1].key).toBe('P-2');
    });

    it('should pass through non-issue objects', () => {
      expect(Formatter.formatJson({ custom: 'data' })).toEqual({ custom: 'data' });
    });

    it('should handle null', () => {
      expect(Formatter.formatJson(null)).toBeNull();
    });
  });
});
