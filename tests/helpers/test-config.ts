import { ConfigManager } from '../../src/config/config-manager.js';
import { CoreClient } from '../../src/clients/core.js';

/**
 * Helper to setup test client with proper configuration
 */
export async function setupTestClient(): Promise<{
  client: CoreClient;
  config: ConfigManager;
}> {
  const configManager = new ConfigManager();
  
  try {
    // Load token from keychain
    await configManager.loadTokenFromKeychain();
    
    // Get full config
    const config = await configManager.getConfig();
    
    // Create client
    const client = new CoreClient(config);
    
    return { client, config: configManager };
  } catch (error: any) {
    throw new Error(
      `Failed to setup test client. Ensure you have:\n` +
      `1. Run 'jira auth set' to configure global authentication\n` +
      `2. Run 'jira init' in the test directory to configure project\n` +
      `Error: ${error.message}`
    );
  }
}

/**
 * Helper to generate unique test names
 */
export function generateTestName(prefix: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * Factory for creating test issues
 */
export function createTestIssue(overrides: any = {}) {
  return {
    summary: generateTestName('Test Issue'),
    description: 'Created by automated test',
    issueType: 'Task',
    labels: ['test', 'automated-test'],
    ...overrides,
  };
}

/**
 * Factory for creating test subtasks
 */
export function createTestSubtask(parentKey: string, overrides: any = {}) {
  const issueType = process.env.JIRA_SUBTASK_TYPE || 'Subtask';
  return {
    summary: generateTestName('Test Subtask'),
    description: 'Subtask created by automated test',
    issueType,
    customFields: {
      parent: { key: parentKey },
      ...overrides.customFields,
    },
    ...overrides,
  };
}

/**
 * Helper to clean up test issues by pattern
 */
export async function cleanupTestIssues(client: CoreClient, projectKey: string) {
  try {
    const result = await client.searchIssues({
      jql: `project = ${projectKey} AND labels = "automated-test" ORDER BY created DESC`,
      maxResults: 100,
    });
    
    for (const issue of result.issues) {
      try {
        await client.deleteIssue(issue.key);
        console.log(`Cleaned up orphaned test issue: ${issue.key}`);
      } catch (error: any) {
        console.warn(`Could not delete ${issue.key}: ${error.message}`);
      }
    }
  } catch (error: any) {
    console.warn('Could not perform test cleanup:', error.message);
  }
}