import { describe, it, expect } from 'vitest';
import { CSVParser } from '../../../src/utils/csv-parser.js';

describe('CSVParser', () => {
  describe('parseContent', () => {
    it('should parse basic CSV with standard headers', () => {
      const csv = `Summary,Type,Priority,Description
Fix login,Bug,High,Users cannot login`;
      const result = CSVParser.parseContent(csv);
      expect(result).toHaveLength(1);
      expect(result[0].summary).toBe('Fix login');
      expect(result[0].issueType).toBe('Bug');
      expect(result[0].priority).toBe('High');
      expect(result[0].description).toBe('Users cannot login');
    });

    it('should handle case-insensitive headers', () => {
      const csv = `SUMMARY,TYPE,PRIORITY
Add feature,Story,Medium`;
      const result = CSVParser.parseContent(csv);
      expect(result[0].summary).toBe('Add feature');
      expect(result[0].issueType).toBe('Story');
    });

    it('should handle alternative column names', () => {
      const csv = `Title,Kind,Pri
Some task,Task,Low`;
      const result = CSVParser.parseContent(csv);
      expect(result[0].summary).toBe('Some task');
      expect(result[0].issueType).toBe('Task');
      expect(result[0].priority).toBe('Low');
    });

    it('should parse labels from comma-separated values', () => {
      const csv = `Summary,Type,Labels
Fix bug,Bug,"ui,frontend"`;
      const result = CSVParser.parseContent(csv);
      expect(result[0].labels).toEqual(['ui', 'frontend']);
    });

    it('should parse labels from pipe-separated values', () => {
      const csv = `Summary,Type,Labels
Fix bug,Bug,ui|frontend`;
      const result = CSVParser.parseContent(csv);
      expect(result[0].labels).toEqual(['ui', 'frontend']);
    });

    it('should parse story points', () => {
      const csv = `Summary,Type,Story Points
Add feature,Story,5`;
      const result = CSVParser.parseContent(csv);
      expect(result[0].storyPoints).toBe(5);
    });

    it('should ignore negative story points', () => {
      const csv = `Summary,Type,Story Points
Add feature,Story,-3`;
      const result = CSVParser.parseContent(csv);
      expect(result[0].storyPoints).toBeUndefined();
    });

    it('should ignore NaN story points', () => {
      const csv = `Summary,Type,Story Points
Add feature,Story,abc`;
      const result = CSVParser.parseContent(csv);
      expect(result[0].storyPoints).toBeUndefined();
    });

    it('should parse assignee', () => {
      const csv = `Summary,Type,Assignee
Fix bug,Bug,john@example.com`;
      const result = CSVParser.parseContent(csv);
      expect(result[0].assignee).toBe('john@example.com');
    });

    it('should parse parent key', () => {
      const csv = `Summary,Type,Parent
Sub-task,Task,PROJ-100`;
      const result = CSVParser.parseContent(csv);
      expect(result[0].parent).toBe('PROJ-100');
    });

    it('should parse components', () => {
      const csv = `Summary,Type,Components
Fix bug,Bug,"frontend,backend"`;
      const result = CSVParser.parseContent(csv);
      expect(result[0].components).toEqual(['frontend', 'backend']);
    });

    it('should use defaults for missing fields', () => {
      const csv = `Summary
Just a title`;
      const result = CSVParser.parseContent(csv);
      expect(result[0].summary).toBe('Just a title');
      expect(result[0].issueType).toBe('Task');
      expect(result[0].priority).toBe('Medium');
      expect(result[0].description).toBe('');
    });

    it('should handle multiple rows', () => {
      const csv = `Summary,Type
First,Bug
Second,Story
Third,Task`;
      const result = CSVParser.parseContent(csv);
      expect(result).toHaveLength(3);
      expect(result[0].summary).toBe('First');
      expect(result[1].summary).toBe('Second');
      expect(result[2].summary).toBe('Third');
    });

    it('should skip empty lines', () => {
      const csv = `Summary,Type
First,Bug

Second,Story`;
      const result = CSVParser.parseContent(csv);
      expect(result).toHaveLength(2);
    });

    it('should return empty array for empty CSV', () => {
      const result = CSVParser.parseContent('');
      expect(result).toEqual([]);
    });
  });

  describe('generateTemplate', () => {
    it('should generate a valid CSV template', () => {
      const template = CSVParser.generateTemplate();
      expect(template).toContain('Summary');
      expect(template).toContain('Type');
      expect(template).toContain('Priority');
      expect(template).toContain('Description');
      expect(template).toContain('Labels');
      expect(template).toContain('Assignee');
      expect(template).toContain('Story Points');
      expect(template).toContain('Components');
      expect(template).toContain('Parent');
    });

    it('should produce parseable CSV', () => {
      const template = CSVParser.generateTemplate();
      const result = CSVParser.parseContent(template);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].summary).toBeTruthy();
    });
  });
});
