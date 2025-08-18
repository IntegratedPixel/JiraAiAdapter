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
  
  // Load token from keychain
  await configManager.loadTokenFromKeychain();
  
  // Get full config
  const config = await configManager.getConfig();
  
  // Create client
  const client = new CoreClient(config);
  
  return { client, config: configManager };
}

/**
 * Helper to generate unique test names
 */
export function generateTestName(prefix: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  return `${prefix}_${timestamp}_${random}`;
}