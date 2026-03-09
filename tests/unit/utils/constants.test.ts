import { describe, it, expect } from 'vitest';
import {
  STORY_POINT_FIELDS,
  EPIC_LINK_FIELDS,
  ISSUE_TYPE_CHOICES,
  PRIORITY_CHOICES,
  DEFAULTS,
} from '../../../src/constants.js';

describe('Constants', () => {
  describe('STORY_POINT_FIELDS', () => {
    it('should contain known story point field IDs', () => {
      expect(STORY_POINT_FIELDS).toContain('customfield_10016');
      expect(STORY_POINT_FIELDS).toContain('customfield_10002');
      expect(STORY_POINT_FIELDS.length).toBeGreaterThanOrEqual(4);
    });

    it('should be a readonly tuple', () => {
      expect(Array.isArray(STORY_POINT_FIELDS)).toBe(true);
    });
  });

  describe('EPIC_LINK_FIELDS', () => {
    it('should contain known Epic Link field IDs', () => {
      expect(EPIC_LINK_FIELDS).toContain('customfield_10014');
      expect(EPIC_LINK_FIELDS.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('ISSUE_TYPE_CHOICES', () => {
    it('should include standard issue types', () => {
      expect(ISSUE_TYPE_CHOICES).toContain('Bug');
      expect(ISSUE_TYPE_CHOICES).toContain('Story');
      expect(ISSUE_TYPE_CHOICES).toContain('Task');
      expect(ISSUE_TYPE_CHOICES).toContain('Epic');
      expect(ISSUE_TYPE_CHOICES).toContain('Sub-task');
    });
  });

  describe('PRIORITY_CHOICES', () => {
    it('should include all priority levels in order', () => {
      expect(PRIORITY_CHOICES).toEqual(['Highest', 'High', 'Medium', 'Low', 'Lowest']);
    });
  });

  describe('DEFAULTS', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULTS.ISSUE_TYPE).toBe('Task');
      expect(DEFAULTS.PRIORITY).toBe('Medium');
      expect(DEFAULTS.LIST_LIMIT).toBe(20);
    });
  });
});
