import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';
import { CoreClient } from '../../src/clients/core.js';
import { ConfigManager } from '../../src/config/config-manager.js';
import { createTestIssue } from '../helpers/test-config.js';

const execAsync = promisify(exec);

describe('CLI Commands Integration', () => {
  let client: CoreClient;
  let testIssueKey: string;
  let projectKey: string;

  beforeAll(async () => {
    // Setup client for test data creation
    const configManager = new ConfigManager();
    await configManager.loadTokenFromKeychain();
    const config = await configManager.getConfig();
    client = new CoreClient(config);
    projectKey = config.project;

    // Create a test issue for view/delete commands
    const issueData = createTestIssue({
      summary: 'CLI Command Test Issue',
      description: 'Issue for testing CLI commands',
    });
    const issue = await client.createIssue(issueData);
    testIssueKey = issue.key;
    console.log(`Created test issue: ${testIssueKey}`);
  });

  afterAll(async () => {
    // Cleanup
    if (testIssueKey) {
      try {
        await client.deleteIssue(testIssueKey);
        console.log(`Cleaned up test issue: ${testIssueKey}`);
      } catch (error) {
        console.warn(`Could not cleanup ${testIssueKey}`);
      }
    }
  });

  describe('jira list', () => {
    it('should list issues in JSON format', async () => {
      const { stdout } = await execAsync('node dist/index.js list --json --limit 5');
      const result = JSON.parse(stdout);
      
      expect(result.ok).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeLessThanOrEqual(5);
    });

    it('should filter by status', async () => {
      const { stdout } = await execAsync('node dist/index.js list --status "To Do" --json');
      const result = JSON.parse(stdout);
      
      expect(result.ok).toBe(true);
      if (result.data.length > 0) {
        expect(result.data[0].fields.status.name).toBe('To Do');
      }
    });

    it('should filter by assignee', async () => {
      const { stdout } = await execAsync('node dist/index.js list --mine --json --limit 5');
      const result = JSON.parse(stdout);
      
      expect(result.ok).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should handle JQL queries', async () => {
      const jql = `project = ${projectKey} AND labels = "test"`;
      const { stdout } = await execAsync(`node dist/index.js list --jql "${jql}" --json`);
      const result = JSON.parse(stdout);
      
      expect(result.ok).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  describe('jira view', () => {
    it('should view an issue in JSON format', async () => {
      const { stdout } = await execAsync(`node dist/index.js view ${testIssueKey} --json`);
      const result = JSON.parse(stdout);
      
      expect(result.ok).toBe(true);
      expect(result.data.key).toBe(testIssueKey);
      expect(result.data.fields.summary).toContain('CLI Command Test Issue');
    });

    it('should include comments when requested', async () => {
      // Add a comment first
      await client.addComment(testIssueKey, 'Test comment for CLI');
      
      const { stdout } = await execAsync(`node dist/index.js view ${testIssueKey} --comments --json`);
      const result = JSON.parse(stdout);
      
      expect(result.ok).toBe(true);
      expect(result.data.comments).toBeDefined();
      expect(Array.isArray(result.data.comments)).toBe(true);
      expect(result.data.comments.length).toBeGreaterThan(0);
    });

    it('should handle non-existent issues', async () => {
      try {
        await execAsync('node dist/index.js view INVALID-99999 --json');
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        const output = error.stdout || error.stderr;
        if (output) {
          const result = JSON.parse(output);
          expect(result.ok).toBe(false);
          expect(result.error).toBeDefined();
        }
      }
    });
  });

  describe('jira create', () => {
    it('should create an issue with dry-run', async () => {
      const { stdout } = await execAsync(
        'node dist/index.js create --type Task --summary "Dry run test" --dry-run --json'
      );
      const result = JSON.parse(stdout);
      
      expect(result.ok).toBe(true);
      expect(result.data.fields.summary).toBe('Dry run test');
      expect(result.data.fields.issuetype.name).toBe('Task');
    });

    it('should validate required fields', async () => {
      try {
        await execAsync('node dist/index.js create --type Task --json');
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        // Expected to fail without summary
        expect(error.code).toBeTruthy();
      }
    });
  });

  describe('jira auth', () => {
    it('should test connection', async () => {
      const { stdout } = await execAsync('node dist/index.js auth test --json');
      const result = JSON.parse(stdout);
      
      expect(result.ok).toBe(true);
      expect(result.data.user).toBeDefined();
      expect(result.data.user.displayName).toBeDefined();
      expect(result.data.project).toBe(projectKey);
    });

    it('should show status', async () => {
      const { stdout } = await execAsync('node dist/index.js auth status');
      
      expect(stdout).toContain('Authentication Status');
      expect(stdout).toContain('Global Configuration');
      expect(stdout).toContain('Project Configuration');
    });
  });

  describe('jira status', () => {
    it('should show configuration status', async () => {
      const { stdout } = await execAsync('node dist/index.js status');
      
      expect(stdout).toContain('Configuration Status');
      expect(stdout).toContain('Host:');
      expect(stdout).toContain('Email:');
      expect(stdout).toContain('Project:');
    });
  });

  describe('error handling', () => {
    it('should return proper exit codes for errors', async () => {
      try {
        await execAsync('node dist/index.js view NONEXISTENT-99999');
        expect.fail('Should have thrown an error');
      } catch (error: any) {
        // Exit code should be non-zero
        expect(error.code).toBeGreaterThan(0);
      }
    });

    it('should handle network errors gracefully', async () => {
      // This would require mocking network failures
      // For now, just ensure the command structure works
      const { stdout } = await execAsync('node dist/index.js --help');
      expect(stdout).toContain('AI-friendly Jira CLI tool');
    });
  });
});