import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { CoreClient } from '../../src/clients/core.js';
import { ConfigManager } from '../../src/config/config-manager.js';
import { ADFBuilder } from '../../src/utils/adf.js';
import { createTestIssue, createTestSubtask, cleanupTestIssues } from '../helpers/test-config.js';
import dotenv from 'dotenv';

dotenv.config();

describe('Jira CLI Lifecycle Integration Test', () => {
  let client: CoreClient;
  let configManager: ConfigManager;
  let testIssueKey: string;
  let testSubtaskKey: string;
  let testCommentId: string;
  
  const TEST_COMMENT_TEXT = 'Test comment on subtask';
  const UPDATED_DESCRIPTION = 'Updated description for the test issue';
  const UPDATED_LABELS = ['test', 'automated-test', 'updated'];

  beforeAll(async () => {
    try {
      // Initialize config manager and client
      configManager = new ConfigManager();
      
      // Load config with token from keychain
      await configManager.loadTokenFromKeychain();
      const config = await configManager.getConfig();
      
      // Initialize client
      client = new CoreClient(config);
      
      console.log(`\n🧪 Running lifecycle tests for project: ${config.project}\n`);
      
      // Clean up any orphaned test issues from previous runs
      await cleanupTestIssues(client, config.project);
    } catch (error: any) {
      throw new Error(
        `Failed to initialize test client. Ensure you have:\n` +
        `1. Run 'jira auth set' to configure global authentication\n` +
        `2. Run 'jira init' in the test directory to configure project\n` +
        `Error: ${error.message}`
      );
    }
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
      const issueData = createTestIssue({
        description: 'Initial test issue description',
      });
      
      const result = await client.createIssue(issueData);
      
      console.log('Create issue response:', JSON.stringify(result, null, 2));
      
      // The create endpoint returns the issue with id and key
      expect(result).toBeDefined();
      expect(result.key).toBeDefined();
      
      testIssueKey = result.key;
      
      // Fetch the full issue to verify it was created correctly
      const issue = await client.getIssue(testIssueKey);
      expect(issue.fields.summary).toContain('Test Issue');
      
      console.log(`✅ Created issue: ${testIssueKey}`);
    } catch (error: any) {
      console.error('Failed to create issue:', error.response?.body || error.message);
      throw error;
    }
  });

  it('should create a subtask for the test issue', async () => {
    expect(testIssueKey).toBeDefined();
    
    try {
      const subtaskData = createTestSubtask(testIssueKey, {
        description: 'Subtask description',
      });
      
      const subtask = await client.createIssue(subtaskData);
      
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
    
    // Test both plain text and ADF conversion
    const comment = await client.addComment(testSubtaskKey, TEST_COMMENT_TEXT);
    
    expect(comment).toBeDefined();
    expect(comment.id).toBeDefined();
    expect(comment.body).toBeDefined();
    
    // Verify the comment body contains the expected text in ADF format
    const commentText = ADFBuilder.adfToText(comment.body);
    expect(commentText).toContain(TEST_COMMENT_TEXT);
    
    testCommentId = comment.id;
    console.log(`✅ Added comment to subtask: ${testSubtaskKey}`);
  });

  it('should update multiple fields of the main task', async () => {
    expect(testIssueKey).toBeDefined();
    
    // Update multiple fields to test comprehensive update functionality
    await client.updateIssue(testIssueKey, {
      description: UPDATED_DESCRIPTION,
      labels: { add: ['updated'] },
    });
    
    // Verify the updates
    const updatedIssue = await client.getIssue(testIssueKey);
    
    // Check if description was updated using proper ADF conversion
    const descriptionText = ADFBuilder.adfToText(updatedIssue.fields.description);
    expect(descriptionText).toContain(UPDATED_DESCRIPTION);
    
    // Check if labels were updated
    expect(updatedIssue.fields.labels).toContain('updated');
    
    console.log(`✅ Updated multiple fields of issue: ${testIssueKey}`);
  });

  it('should delete the subtask', async () => {
    expect(testSubtaskKey).toBeDefined();
    
    await client.deleteIssue(testSubtaskKey);
    
    // Verify deletion - should throw 404 error when trying to get deleted issue
    try {
      await client.getIssue(testSubtaskKey);
      throw new Error('Expected 404 error but issue still exists');
    } catch (error: any) {
      expect(error.message).toContain('404');
    }
    
    console.log(`✅ Deleted subtask: ${testSubtaskKey}`);
    testSubtaskKey = ''; // Clear to prevent double deletion in cleanup
  });

  it('should delete the main issue', async () => {
    expect(testIssueKey).toBeDefined();
    
    await client.deleteIssue(testIssueKey);
    
    // Verify deletion - should throw 404 error when trying to get deleted issue
    try {
      await client.getIssue(testIssueKey);
      throw new Error('Expected 404 error but issue still exists');
    } catch (error: any) {
      expect(error.message).toContain('404');
    }
    
    console.log(`✅ Deleted issue: ${testIssueKey}`);
    testIssueKey = ''; // Clear to prevent double deletion in cleanup
  });
});