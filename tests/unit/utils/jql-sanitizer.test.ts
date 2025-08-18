import { describe, it, expect } from 'vitest';
import { JQLSanitizer } from '../../../src/utils/jql-sanitizer.js';

describe('JQL Sanitizer', () => {
  describe('sanitizeFieldValue', () => {
    it('should escape double quotes', () => {
      const result = JQLSanitizer.sanitizeFieldValue('test"value');
      expect(result).toBe('"test\\"value"');
    });

    it('should escape backslashes', () => {
      const result = JQLSanitizer.sanitizeFieldValue('test\\value');
      expect(result).toBe('"test\\\\value"');
    });

    it('should handle single quotes', () => {
      const result = JQLSanitizer.sanitizeFieldValue("test'value");
      expect(result).toBe('"test\'value"');
    });

    it('should handle special characters', () => {
      const result = JQLSanitizer.sanitizeFieldValue('test\nvalue\ttab');
      expect(result).toBe('"test\\nvalue\\ttab"');
    });

    it('should handle empty strings', () => {
      const result = JQLSanitizer.sanitizeFieldValue('');
      expect(result).toBe('""');
    });

    it('should handle null and undefined', () => {
      expect(JQLSanitizer.sanitizeFieldValue(null as any)).toBe('""');
      expect(JQLSanitizer.sanitizeFieldValue(undefined as any)).toBe('""');
    });

    it('should prevent SQL injection attempts', () => {
      const result = JQLSanitizer.sanitizeFieldValue("'; DROP TABLE users; --");
      expect(result).toBe('"\'; DROP TABLE users; --"');
    });

    it('should handle OR/AND injection attempts', () => {
      const result = JQLSanitizer.sanitizeFieldValue('" OR 1=1 --');
      expect(result).toBe('"\\" OR 1=1 --"');
    });
  });

  describe('escapeValue', () => {
    it('should escape quotes and backslashes', () => {
      const result = JQLSanitizer.escapeValue('test"with\\special');
      expect(result).toBe('test\\"with\\\\special');
    });

    it('should handle newlines and tabs', () => {
      const result = JQLSanitizer.escapeValue('line1\nline2\ttab');
      expect(result).toBe('line1\\nline2\\ttab');
    });

    it('should handle carriage returns', () => {
      const result = JQLSanitizer.escapeValue('test\rvalue');
      expect(result).toBe('test\\rvalue');
    });
  });

  describe('sanitizeOperator', () => {
    it('should allow valid operators', () => {
      const validOperators = ['=', '!=', '>', '<', '>=', '<=', '~', '!~', 'in', 'not in'];
      
      validOperators.forEach(op => {
        expect(JQLSanitizer.sanitizeOperator(op)).toBe(op);
      });
    });

    it('should reject invalid operators', () => {
      expect(() => JQLSanitizer.sanitizeOperator('DROP')).toThrow('Invalid operator');
      expect(() => JQLSanitizer.sanitizeOperator('--')).toThrow('Invalid operator');
      expect(() => JQLSanitizer.sanitizeOperator(';')).toThrow('Invalid operator');
    });

    it('should handle case sensitivity', () => {
      expect(JQLSanitizer.sanitizeOperator('IN')).toBe('IN');
      expect(JQLSanitizer.sanitizeOperator('NOT IN')).toBe('NOT IN');
    });
  });

  describe('buildCondition', () => {
    it('should build a simple condition', () => {
      const result = JQLSanitizer.buildCondition('status', '=', 'Done');
      expect(result).toBe('status = "Done"');
    });

    it('should handle IN operator with array', () => {
      const result = JQLSanitizer.buildCondition('status', 'in', ['To Do', 'In Progress']);
      expect(result).toBe('status in ("To Do", "In Progress")');
    });

    it('should handle NOT IN operator', () => {
      const result = JQLSanitizer.buildCondition('status', 'not in', ['Done', 'Closed']);
      expect(result).toBe('status not in ("Done", "Closed")');
    });

    it('should escape special characters in values', () => {
      const result = JQLSanitizer.buildCondition('summary', '~', 'test"value');
      expect(result).toBe('summary ~ "test\\"value"');
    });

    it('should handle numeric comparisons', () => {
      const result = JQLSanitizer.buildCondition('priority', '>', '3');
      expect(result).toBe('priority > "3"');
    });
  });

  describe('validateJQL', () => {
    it('should allow valid JQL queries', () => {
      const validQueries = [
        'project = TEST',
        'status = "In Progress" AND assignee = currentUser()',
        'labels in (bug, urgent) OR priority = High',
        'created >= -7d',
        'sprint in openSprints()',
      ];
      
      validQueries.forEach(query => {
        expect(() => JQLSanitizer.validateJQL(query)).not.toThrow();
      });
    });

    it('should reject SQL keywords', () => {
      const sqlQueries = [
        'SELECT * FROM issues',
        'project = TEST; DROP TABLE users',
        'status = Done -- comment',
        'INSERT INTO issues VALUES',
        'DELETE FROM issues',
      ];
      
      sqlQueries.forEach(query => {
        expect(() => JQLSanitizer.validateJQL(query)).toThrow();
      });
    });

    it('should reject script injections', () => {
      expect(() => JQLSanitizer.validateJQL('<script>alert(1)</script>')).toThrow();
      expect(() => JQLSanitizer.validateJQL('javascript:void(0)')).toThrow();
    });

    it('should handle empty and null queries', () => {
      expect(() => JQLSanitizer.validateJQL('')).not.toThrow();
      expect(() => JQLSanitizer.validateJQL(null as any)).not.toThrow();
    });
  });

  describe('sanitizeList', () => {
    it('should sanitize array of values', () => {
      const result = JQLSanitizer.sanitizeList(['value1', 'value"2', 'value\\3']);
      expect(result).toEqual(['"value1"', '"value\\"2"', '"value\\\\3"']);
    });

    it('should handle empty array', () => {
      const result = JQLSanitizer.sanitizeList([]);
      expect(result).toEqual([]);
    });

    it('should filter out null/undefined values', () => {
      const result = JQLSanitizer.sanitizeList(['valid', null, undefined, 'another'] as any);
      expect(result).toEqual(['"valid"', '""', '""', '"another"']);
    });
  });
});