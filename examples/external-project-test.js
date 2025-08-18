/**
 * Example test file for using Jira CLI in your project tests
 * Copy this to your project and adjust as needed
 * 
 * Prerequisites:
 * 1. Install the Jira CLI: npm link @integratedpixel/jira-ai-cli
 * 2. Configure auth: jira auth set
 * 3. Configure project: jira init
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
// Or for Jest: const { describe, it, expect, beforeAll, afterAll } = require('@jest/globals');

// Option 1: Use the CLI via shell commands
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

// Option 2: Use the API directly
import { CoreClient, ConfigManager } from '@integratedpixel/jira-ai-cli';

describe('Jira Integration Tests', () => {
  let client;
  let testIssueKey;

  // Setup - Initialize the Jira client
  beforeAll(async () => {
    const configManager = new ConfigManager();
    await configManager.loadTokenFromKeychain();
    const config = await configManager.getConfig();
    client = new CoreClient(config);
  });

  // Cleanup - Delete any test issues created
  afterAll(async () => {
    if (testIssueKey) {
      try {
        await client.deleteIssue(testIssueKey);
        console.log(`Cleaned up test issue: ${testIssueKey}`);
      } catch (error) {
        console.warn(`Could not cleanup ${testIssueKey}:`, error.message);
      }
    }
  });

  describe('API Tests', () => {
    it('should connect to Jira', async () => {
      const user = await client.testConnection();
      expect(user).toBeDefined();
      expect(user.emailAddress).toBeDefined();
      console.log(`Connected as: ${user.displayName}`);
    });

    it('should create an issue', async () => {
      const issue = await client.createIssue({
        summary: `Test Issue ${Date.now()}`,
        description: 'Created by automated test',
        issueType: 'Task',
        labels: ['test', 'automated'],
      });

      expect(issue).toBeDefined();
      expect(issue.key).toBeDefined();
      testIssueKey = issue.key;
      console.log(`Created issue: ${testIssueKey}`);
    });

    it('should list issues', async () => {
      const result = await client.searchIssues({
        jql: `labels = "test" ORDER BY created DESC`,
        maxResults: 10,
      });

      expect(result.issues).toBeDefined();
      expect(Array.isArray(result.issues)).toBe(true);
      console.log(`Found ${result.issues.length} test issues`);
    });

    it('should update an issue', async () => {
      if (!testIssueKey) return;

      await client.updateIssue(testIssueKey, {
        description: 'Updated by test',
      });

      const updated = await client.getIssue(testIssueKey);
      expect(JSON.stringify(updated.fields.description)).toContain('Updated by test');
    });

    it('should add a comment', async () => {
      if (!testIssueKey) return;

      const comment = await client.addComment(
        testIssueKey,
        'Test comment from automated test'
      );

      expect(comment).toBeDefined();
      expect(comment.id).toBeDefined();
    });
  });

  describe('CLI Tests', () => {
    it('should list issues via CLI', async () => {
      const { stdout } = await execAsync('jira list --mine --limit 5 --json');
      const result = JSON.parse(stdout);
      
      expect(result.ok).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should view an issue via CLI', async () => {
      if (!testIssueKey) return;

      const { stdout } = await execAsync(`jira view ${testIssueKey} --json`);
      const result = JSON.parse(stdout);
      
      expect(result.ok).toBe(true);
      expect(result.data.key).toBe(testIssueKey);
    });
  });
});

/**
 * Example: Testing Jira workflow in your application
 */
describe('Application Jira Workflow', () => {
  let client;
  let featureIssueKey;
  let bugIssueKey;

  beforeAll(async () => {
    const configManager = new ConfigManager();
    await configManager.loadTokenFromKeychain();
    const config = await configManager.getConfig();
    client = new CoreClient(config);
  });

  afterAll(async () => {
    // Cleanup
    const issuesToDelete = [featureIssueKey, bugIssueKey].filter(Boolean);
    for (const key of issuesToDelete) {
      try {
        await client.deleteIssue(key);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  });

  it('should create a feature request when user submits feedback', async () => {
    // Simulate your app creating a feature request
    const feature = await client.createIssue({
      summary: 'User requested dark mode',
      description: 'User feedback: Please add dark mode support',
      issueType: 'Task',
      labels: ['user-feedback', 'feature-request', 'test'],
    });

    featureIssueKey = feature.key;
    expect(feature.key).toMatch(/^[A-Z]+-\d+$/);
  });

  it('should create a bug report when error occurs', async () => {
    // Simulate your app creating a bug report
    const bug = await client.createIssue({
      summary: 'Crash on startup',
      description: `
Error: Cannot read property 'x' of undefined
Stack trace:
  at app.js:123
  at process()
      `,
      issueType: 'Bug',
      labels: ['automated-bug-report', 'test'],
    });

    bugIssueKey = bug.key;
    expect(bug.key).toMatch(/^[A-Z]+-\d+$/);
  });
});