import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { CoreClient } from '../../src/clients/core.js';
import { ConfigManager } from '../../src/config/config-manager.js';
import dotenv from 'dotenv';

dotenv.config();

describe('Jira CLI Lifecycle Integration Test', () => {
  let client: CoreClient;
  let configManager: ConfigManager;
  let testIssueKey: string;
  let testSubtaskKey: string;
  let testCommentId: string;
  
  const TEST_ISSUE_SUMMARY = `Test Issue ${Date.now()}`;
  const TEST_SUBTASK_SUMMARY = `Test Subtask ${Date.now()}`;
  const TEST_COMMENT_TEXT = 'Test comment on subtask';
  const UPDATED_DESCRIPTION = 'Updated description for the test issue';

  beforeAll(async () => {
    // Initialize config manager and client
    configManager = new ConfigManager();
    
    // Load config with token from keychain
    await configManager.loadTokenFromKeychain();
    const config = await configManager.getConfig();
    
    // Initialize client
    client = new CoreClient(config);
    
    console.log(`\n🧪 Running lifecycle tests for project: ${config.project}\n`);
  });

  afterAll(async () => {
    // Cleanup: attempt to delete any created test issues
    if (testSubtaskKey) {
      try {
        await client.deleteIssue(testSubtaskKey);
        console.log(`✅ Cleaned up subtask: ${testSubtaskKey}`);
      } catch (error) {
        console.log(`⚠️  Could not clean up subtask: ${testSubtaskKey}`);
      }
    }
    
    if (testIssueKey) {
      try {
        await client.deleteIssue(testIssueKey);
        console.log(`✅ Cleaned up issue: ${testIssueKey}`);
      } catch (error) {
        console.log(`⚠️  Could not clean up issue: ${testIssueKey}`);
      }
    }
  });

  it('should read organization/user information', async () => {
    const user = await client.testConnection();
    
    expect(user).toBeDefined();
    expect(user.displayName).toBeDefined();
    expect(user.emailAddress).toBeDefined();
    
    console.log(`✅ Read org - User: ${user.displayName} (${user.emailAddress})`);
  });

  it('should read project information', async () => {
    const config = configManager.getPartialConfig();
    const project = await client.getProject(config.project!);
    
    expect(project).toBeDefined();
    expect(project.key).toBe(config.project);
    expect(project.name).toBeDefined();
    expect(project.id).toBeDefined();
    
    console.log(`✅ Read project - ${project.name} (${project.key})`);
  });

  it('should create a test issue', async () => {
    try {
      const result = await client.createIssue({
        summary: TEST_ISSUE_SUMMARY,
        description: 'Initial test issue description',
        issueType: 'Task',
        // Removed priority as it may not be available on all screens
        labels: ['test', 'automated-test'],
      });
      
      console.log('Create issue response:', JSON.stringify(result, null, 2));
      
      // The create endpoint returns the issue with id and key
      expect(result).toBeDefined();
      expect(result.key).toBeDefined();
      
      testIssueKey = result.key;
      
      // Fetch the full issue to verify it was created correctly
      const issue = await client.getIssue(testIssueKey);
      expect(issue.fields.summary).toBe(TEST_ISSUE_SUMMARY);
      
      console.log(`✅ Created issue: ${testIssueKey}`);
    } catch (error: any) {
      console.error('Failed to create issue:', error.response?.body || error.message);
      throw error;
    }
  });

  it('should create a subtask for the test issue', async () => {
    expect(testIssueKey).toBeDefined();
    
    try {
      // Create subtask - needs parent field
      const subtask = await client.createIssue({
        summary: TEST_SUBTASK_SUMMARY,
        description: 'Subtask description',
        issueType: 'Subtask', // Try 'Subtask' instead of 'Sub-task'
        customFields: {
          parent: { key: testIssueKey }
        }
      });
      
      expect(subtask).toBeDefined();
      expect(subtask.key).toBeDefined();
      
      testSubtaskKey = subtask.key;
      console.log(`✅ Created subtask: ${testSubtaskKey}`);
    } catch (error: any) {
      console.error('Failed to create subtask:', error.response?.body || error.message);
      throw error;
    }
  });

  it('should add a comment to the subtask', async () => {
    expect(testSubtaskKey).toBeDefined();
    
    const comment = await client.addComment(testSubtaskKey, TEST_COMMENT_TEXT);
    
    expect(comment).toBeDefined();
    expect(comment.id).toBeDefined();
    expect(comment.body).toBeDefined();
    
    testCommentId = comment.id;
    console.log(`✅ Added comment to subtask: ${testSubtaskKey}`);
  });

  it('should update the description of the main task', async () => {
    expect(testIssueKey).toBeDefined();
    
    await client.updateIssue(testIssueKey, {
      description: UPDATED_DESCRIPTION,
    });
    
    // Verify the update
    const updatedIssue = await client.getIssue(testIssueKey);
    
    // Check if description was updated (comparing ADF content)
    const descriptionContent = JSON.stringify(updatedIssue.fields.description);
    expect(descriptionContent).toContain(UPDATED_DESCRIPTION);
    
    console.log(`✅ Updated description of issue: ${testIssueKey}`);
  });

  it('should delete the subtask', async () => {
    expect(testSubtaskKey).toBeDefined();
    
    await client.deleteIssue(testSubtaskKey);
    
    // Verify deletion - should throw error when trying to get deleted issue
    await expect(client.getIssue(testSubtaskKey)).rejects.toThrow();
    
    console.log(`✅ Deleted subtask: ${testSubtaskKey}`);
    testSubtaskKey = ''; // Clear to prevent double deletion in cleanup
  });

  it('should delete the main issue', async () => {
    expect(testIssueKey).toBeDefined();
    
    await client.deleteIssue(testIssueKey);
    
    // Verify deletion - should throw error when trying to get deleted issue
    await expect(client.getIssue(testIssueKey)).rejects.toThrow();
    
    console.log(`✅ Deleted issue: ${testIssueKey}`);
    testIssueKey = ''; // Clear to prevent double deletion in cleanup
  });
});