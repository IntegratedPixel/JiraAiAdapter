import { describe, it, expect } from 'vitest';
import { MarkdownParser } from '../../../src/utils/markdown-parser.js';

describe('MarkdownParser', () => {
  describe('parseContent', () => {
    it('should extract unchecked checkbox items', () => {
      const md = `## Tasks
- [ ] Add user authentication
- [ ] Fix login page`;
      const result = MarkdownParser.parseContent(md);
      expect(result.length).toBeGreaterThanOrEqual(2);
      const summaries = result.map(r => r.summary);
      expect(summaries).toContain('Add user authentication');
      expect(summaries).toContain('Fix login page');
    });

    it('should extract BUG-prefixed items', () => {
      const md = `- BUG: Login fails on Chrome
- Bug: Signup redirects incorrectly`;
      const result = MarkdownParser.parseContent(md);
      const bugs = result.filter(r => r.issueType === 'Bug');
      expect(bugs.length).toBeGreaterThanOrEqual(1);
    });

    it('should extract FEATURE-prefixed items', () => {
      const md = `- FEATURE: Add dark mode
- Feature: User profile page`;
      const result = MarkdownParser.parseContent(md);
      const stories = result.filter(r => r.issueType === 'Story');
      expect(stories.length).toBeGreaterThanOrEqual(1);
    });

    it('should extract TODO items', () => {
      const md = `- TODO: Update documentation
- Todo: Refactor auth module`;
      const result = MarkdownParser.parseContent(md);
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('should determine issue type from section header', () => {
      const md = `## Bugs
- [ ] Fix crash on startup

## Features
- [ ] Add export functionality`;
      const result = MarkdownParser.parseContent(md);
      const bugSection = result.find(r => r.summary === 'Fix crash on startup');
      const featureSection = result.find(r => r.summary === 'Add export functionality');
      if (bugSection) expect(bugSection.issueType).toBe('Bug');
      if (featureSection) expect(featureSection.issueType).toBe('Story');
    });

    it('should extract priority from text', () => {
      const md = `- [ ] URGENT: Fix critical security hole
- [ ] P3 Low priority cleanup`;
      const result = MarkdownParser.parseContent(md);
      const urgent = result.find(r => r.summary.includes('security'));
      if (urgent) expect(urgent.priority).toBe('Highest');
    });

    it('should extract hashtag labels', () => {
      const md = `## Tasks
- [ ] Add login page #frontend #ui`;
      const result = MarkdownParser.parseContent(md);
      const item = result.find(r => r.summary.includes('login'));
      if (item) {
        expect(item.labels).toContain('frontend');
        expect(item.labels).toContain('ui');
      }
    });

    it('should extract bracket labels', () => {
      const md = `## Tasks
- [ ] [backend] Fix API endpoint`;
      const result = MarkdownParser.parseContent(md);
      const item = result.find(r => r.summary.includes('API'));
      if (item) {
        expect(item.labels).toContain('backend');
      }
    });

    it('should deduplicate issues with same summary', () => {
      const md = `## Tasks
- [ ] Fix login page

## Bugs
- [ ] Fix login page`;
      const result = MarkdownParser.parseContent(md);
      const loginItems = result.filter(r => r.summary.toLowerCase().includes('fix login page'));
      expect(loginItems).toHaveLength(1);
    });

    it('should return empty array for content without issues', () => {
      const md = `# Project README
This is a project description with no actionable items.`;
      const result = MarkdownParser.parseContent(md);
      expect(result).toEqual([]);
    });

    it('should handle custom section mappings', () => {
      const md = `## Known Issues
- [ ] Memory leak in auth service`;
      const result = MarkdownParser.parseContent(md, {
        sectionMapping: { 'Known Issues': 'Bug' },
      });
      const item = result.find(r => r.summary.includes('Memory leak'));
      if (item) expect(item.issueType).toBe('Bug');
    });

    it('should add section header as label', () => {
      const md = `## Authentication
- [ ] Add password reset flow`;
      const result = MarkdownParser.parseContent(md);
      const item = result.find(r => r.summary.includes('password reset'));
      if (item) {
        expect(item.labels).toContain('authentication');
      }
    });

    it('should auto-detect content labels', () => {
      const md = `## Tasks
- [ ] Fix the backend API server`;
      const result = MarkdownParser.parseContent(md);
      const item = result.find(r => r.summary.includes('backend'));
      if (item) {
        expect(item.labels).toContain('backend');
      }
    });
  });

  describe('toJiraFormat', () => {
    it('should convert parsed issues to Jira creation format', () => {
      const issues = [
        {
          summary: 'Fix bug',
          description: 'Detailed description',
          issueType: 'Bug',
          priority: 'High',
          labels: ['frontend'],
          components: ['auth'],
        },
      ];
      const result = MarkdownParser.toJiraFormat(issues);
      expect(result).toHaveLength(1);
      expect(result[0].fields.summary).toBe('Fix bug');
      expect(result[0].fields.issuetype).toEqual({ name: 'Bug' });
      expect(result[0].fields.priority).toEqual({ name: 'High' });
      expect(result[0].fields.labels).toEqual(['frontend']);
      expect(result[0].fields.components).toEqual([{ name: 'auth' }]);
    });

    it('should handle issues without optional fields', () => {
      const issues = [
        { summary: 'Simple task', description: '', issueType: 'Task' },
      ];
      const result = MarkdownParser.toJiraFormat(issues);
      expect(result[0].fields.priority).toBeUndefined();
      expect(result[0].fields.labels).toBeUndefined();
    });
  });
});
