/**
 * Shared constants used across the codebase.
 */

/**
 * Common Jira custom field IDs for story points.
 * These vary by instance; checked in order until one is found.
 */
export const STORY_POINT_FIELDS = [
  'customfield_10016',
  'customfield_10002',
  'customfield_10004',
  'customfield_10008',
  'story_point_estimate',
  'storyPoints',
] as const;

/**
 * Common Jira custom field IDs for Epic Link.
 * Checked as fallback when edit/create metadata doesn't reveal the field.
 */
export const EPIC_LINK_FIELDS = [
  'customfield_10014',
  'customfield_10013',
  'customfield_10015',
  'customfield_10009',
] as const;

/**
 * Standard issue types offered in interactive prompts.
 */
export const ISSUE_TYPE_CHOICES = ['Bug', 'Story', 'Task', 'Epic', 'Sub-task'] as const;

/**
 * Standard priority levels offered in interactive prompts.
 */
export const PRIORITY_CHOICES = ['Highest', 'High', 'Medium', 'Low', 'Lowest'] as const;

/**
 * Default values for issue creation.
 */
export const DEFAULTS = {
  ISSUE_TYPE: 'Task',
  PRIORITY: 'Medium',
  LIST_LIMIT: 20,
} as const;
