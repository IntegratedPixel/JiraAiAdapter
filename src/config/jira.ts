import { cosmiconfigSync } from 'cosmiconfig';
import dotenv from 'dotenv';
import { homedir } from 'os';
import * as keytar from 'keytar';

dotenv.config();

export interface JiraConfig {
  host: string;
  email: string;
  apiToken: string;
  project: string;
  defaultIssueType?: string;
  board?: string;
}

export class ConfigManager {
  private static readonly SERVICE_NAME = 'jira-cli';
  private static readonly explorer = cosmiconfigSync('jira', {
    searchPlaces: [
      '.jirarc.json',
      '.jirarc',
      `${homedir()}/.jirarc.json`,
      `${homedir()}/.jirarc`,
      'package.json',
    ],
  });

  private config: Partial<JiraConfig> = {};
  private configLoaded = false;

  constructor() {
    this.loadConfigSync();
  }

  private loadConfigSync(): void {
    const searchResult = ConfigManager.explorer.search();
    
    if (searchResult) {
      this.config = searchResult.config;
    }

    this.config = {
      host: process.env.JIRA_HOST || this.config.host || '',
      email: process.env.JIRA_EMAIL || this.config.email || '',
      project: process.env.JIRA_PROJECT || this.config.project || '',
      defaultIssueType: process.env.JIRA_DEFAULT_ISSUE_TYPE || this.config.defaultIssueType || 'Task',
      board: process.env.JIRA_BOARD || this.config.board,
      apiToken: process.env.JIRA_TOKEN || '', // Will be loaded from keychain if available
    };

    this.configLoaded = true;
  }

  async loadTokenFromKeychain(): Promise<void> {
    if (!this.configLoaded) {
      throw new Error('Config not loaded');
    }

    // Try to load token from keychain if not already set
    if (this.config.email && !this.config.apiToken) {
      try {
        const token = await keytar.getPassword(ConfigManager.SERVICE_NAME, this.config.email);
        if (token) {
          this.config.apiToken = token;
        }
      } catch (error) {
        // Keychain not available, token remains from env or empty
      }
    }
  }

  async setToken(email: string, token: string): Promise<void> {
    try {
      await keytar.setPassword(ConfigManager.SERVICE_NAME, email, token);
    } catch (error) {
      throw new Error(`Failed to store token in keychain: ${error}`);
    }
  }

  async deleteToken(email: string): Promise<void> {
    try {
      await keytar.deletePassword(ConfigManager.SERVICE_NAME, email);
    } catch (error) {
      throw new Error(`Failed to delete token from keychain: ${error}`);
    }
  }

  validate(): string[] {
    const errors: string[] = [];
    
    if (!this.config.host) {
      errors.push('JIRA_HOST is required (e.g., yourcompany.atlassian.net)');
    }
    
    if (!this.config.email) {
      errors.push('JIRA_EMAIL is required');
    }
    
    if (!this.config.apiToken) {
      errors.push('JIRA_TOKEN is required (API token, not password)');
    }
    
    if (!this.config.project) {
      errors.push('JIRA_PROJECT is required (e.g., PROJ)');
    }
    
    return errors;
  }

  async getConfig(): Promise<JiraConfig> {
    await this.loadTokenFromKeychain();
    
    const errors = this.validate();
    if (errors.length > 0) {
      throw new Error(`Configuration errors:\n${errors.join('\n')}`);
    }
    
    return this.config as JiraConfig;
  }

  getPartialConfig(): Partial<JiraConfig> {
    return this.config;
  }

  async isConfigured(): Promise<boolean> {
    await this.loadTokenFromKeychain();
    return this.validate().length === 0;
  }
}