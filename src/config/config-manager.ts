import { cosmiconfigSync } from 'cosmiconfig';
import { homedir } from 'os';
import { resolve } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import * as keytar from 'keytar';
import dotenv from 'dotenv';

dotenv.config();

export interface GlobalConfig {
  host: string;
  email: string;
  apiToken?: string;
}

export interface ProjectConfig {
  project: string;
  board?: string;
  defaultIssueType?: string;
  defaultAssignee?: string;
  defaultLabels?: string[];
  defaultPriority?: string;
}

export interface JiraFullConfig extends GlobalConfig, ProjectConfig {}

export class ConfigManager {
  private static readonly SERVICE_NAME = 'jira-cli';
  private static readonly GLOBAL_CONFIG_PATH = resolve(homedir(), '.jirarc.json');
  
  private static readonly explorer = cosmiconfigSync('jira', {
    searchPlaces: [
      '.jirarc.json',
      '.jirarc',
      'package.json',
    ],
  });

  private globalConfig: Partial<GlobalConfig> = {};
  private projectConfig: Partial<ProjectConfig> = {};
  private configLoaded = false;

  constructor() {
    this.loadConfigs();
  }

  private loadConfigs(): void {
    // 1. Load global config (lowest priority)
    this.loadGlobalConfig();
    
    // 2. Apply environment variables (override global, but can be overridden by project)
    this.applyEnvironmentVariables();
    
    // 3. Load project-specific config (highest priority - overrides env vars and global)
    this.loadProjectConfig();
    
    this.configLoaded = true;
  }

  private loadGlobalConfig(): void {
    try {
      if (existsSync(ConfigManager.GLOBAL_CONFIG_PATH)) {
        const content = readFileSync(ConfigManager.GLOBAL_CONFIG_PATH, 'utf-8');
        const config = JSON.parse(content);
        this.globalConfig = {
          host: config.host,
          email: config.email,
          // Load apiToken from file if present (fallback when keychain not available)
          apiToken: config.apiToken,
        };
      }
    } catch (error) {
      // Global config doesn't exist or is invalid, that's ok
    }
  }

  private loadProjectConfig(): void {
    // Search for project config in current directory tree
    const searchResult = ConfigManager.explorer.search();
    
    if (searchResult) {
      // Extract only project-specific settings
      const config = searchResult.config;
      this.projectConfig = {
        project: config.project,
        board: config.board,
        defaultIssueType: config.defaultIssueType,
        defaultAssignee: config.defaultAssignee,
        defaultLabels: config.defaultLabels,
        defaultPriority: config.defaultPriority,
      };
      
      // Also load global settings from project config if not already set
      // This allows project-specific .jirarc.json to contain full config
      if (config.host && !this.globalConfig.host) {
        this.globalConfig.host = config.host;
      }
      if (config.email && !this.globalConfig.email) {
        this.globalConfig.email = config.email;
      }
      if (config.apiToken && !this.globalConfig.apiToken) {
        this.globalConfig.apiToken = config.apiToken;
      }
    }
  }

  private applyEnvironmentVariables(): void {
    // Global settings from env vars (override global config files)
    if (process.env.JIRA_HOST) {
      this.globalConfig.host = process.env.JIRA_HOST;
    }
    if (process.env.JIRA_EMAIL) {
      this.globalConfig.email = process.env.JIRA_EMAIL;
    }
    if (process.env.JIRA_TOKEN || process.env.JIRA_API_TOKEN) {
      // Accept both JIRA_TOKEN and JIRA_API_TOKEN for flexibility
      this.globalConfig.apiToken = process.env.JIRA_TOKEN || process.env.JIRA_API_TOKEN;
    }
    
    // Project settings from env vars (will be overridden by project config)
    if (process.env.JIRA_PROJECT) {
      this.projectConfig.project = process.env.JIRA_PROJECT;
    }
    if (process.env.JIRA_BOARD) {
      this.projectConfig.board = process.env.JIRA_BOARD;
    }
    if (process.env.JIRA_DEFAULT_ISSUE_TYPE || process.env.JIRA_DEFAULT_TYPE) {
      this.projectConfig.defaultIssueType = process.env.JIRA_DEFAULT_ISSUE_TYPE || process.env.JIRA_DEFAULT_TYPE;
    }
    if (process.env.JIRA_DEFAULT_ASSIGNEE) {
      this.projectConfig.defaultAssignee = process.env.JIRA_DEFAULT_ASSIGNEE;
    }
    if (process.env.JIRA_DEFAULT_PRIORITY) {
      this.projectConfig.defaultPriority = process.env.JIRA_DEFAULT_PRIORITY;
    }
    if (process.env.JIRA_DEFAULT_LABELS) {
      // Split comma-separated labels
      this.projectConfig.defaultLabels = process.env.JIRA_DEFAULT_LABELS.split(',').map(l => l.trim());
    }
  }

  async loadTokenFromKeychain(): Promise<void> {
    if (!this.configLoaded) {
      throw new Error('Config not loaded');
    }

    // Try to load token from keychain if not already set
    if (this.globalConfig.email && !this.globalConfig.apiToken) {
      try {
        // Check if keytar is available
        if (typeof keytar.getPassword === 'function') {
          const token = await keytar.getPassword(
            ConfigManager.SERVICE_NAME, 
            this.globalConfig.email
          );
          if (token) {
            this.globalConfig.apiToken = token;
          }
        }
      } catch (error) {
        // Keychain not available, token remains from env or file
      }
    }
  }

  async getConfig(overrides?: Partial<ProjectConfig>): Promise<JiraFullConfig> {
    await this.loadTokenFromKeychain();
    
    const config: JiraFullConfig = {
      // Global settings
      host: this.globalConfig.host || '',
      email: this.globalConfig.email || '',
      apiToken: this.globalConfig.apiToken || '',
      
      // Project settings (with command-line overrides)
      project: overrides?.project || this.projectConfig.project || '',
      board: overrides?.board || this.projectConfig.board,
      defaultIssueType: overrides?.defaultIssueType || this.projectConfig.defaultIssueType || 'Task',
      defaultAssignee: overrides?.defaultAssignee || this.projectConfig.defaultAssignee,
      defaultLabels: overrides?.defaultLabels || this.projectConfig.defaultLabels,
      defaultPriority: overrides?.defaultPriority || this.projectConfig.defaultPriority,
    };
    
    return config;
  }

  getPartialConfig(): Partial<JiraFullConfig> {
    return {
      ...this.globalConfig,
      ...this.projectConfig,
    };
  }

  async saveGlobalConfig(config: GlobalConfig): Promise<void> {
    // Save host and email to global config file
    const globalData: any = {
      host: config.host,
      email: config.email,
    };
    
    // Try to save token to keychain, fall back to file if needed
    if (config.apiToken) {
      try {
        await this.setToken(config.email, config.apiToken);
      } catch (error) {
        console.warn('⚠️  Keychain not available, storing token in config file (less secure)');
        console.warn('   Consider using environment variable JIRA_TOKEN for better security');
        globalData.apiToken = config.apiToken;
      }
    }
    
    writeFileSync(
      ConfigManager.GLOBAL_CONFIG_PATH,
      JSON.stringify(globalData, null, 2)
    );
    
    // Reload config
    this.loadConfigs();
  }

  async saveProjectConfig(config: ProjectConfig): Promise<void> {
    const projectConfigPath = resolve(process.cwd(), '.jirarc.json');
    
    // Read existing config if it exists
    let existingConfig = {};
    if (existsSync(projectConfigPath)) {
      try {
        const content = readFileSync(projectConfigPath, 'utf-8');
        existingConfig = JSON.parse(content);
      } catch {
        // Invalid JSON, will be overwritten
      }
    }
    
    // Merge with new config
    const newConfig = {
      ...existingConfig,
      ...config,
    };
    
    // Save to file
    writeFileSync(
      projectConfigPath,
      JSON.stringify(newConfig, null, 2)
    );
    
    // Reload config
    this.loadConfigs();
  }

  async setToken(email: string, token: string): Promise<void> {
    try {
      // Check if keytar is available and has the required function
      if (typeof keytar.setPassword === 'function') {
        await keytar.setPassword(ConfigManager.SERVICE_NAME, email, token);
      } else {
        throw new Error('keytar.setPassword is not a function');
      }
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

  validateGlobal(): string[] {
    const errors: string[] = [];
    
    if (!this.globalConfig.host) {
      errors.push('JIRA_HOST is required (e.g., yourcompany.atlassian.net)');
    }
    
    if (!this.globalConfig.email) {
      errors.push('JIRA_EMAIL is required');
    }
    
    if (!this.globalConfig.apiToken) {
      errors.push('JIRA_TOKEN is required (API token, not password)');
    }
    
    return errors;
  }

  validateProject(): string[] {
    const errors: string[] = [];
    
    if (!this.projectConfig.project) {
      errors.push('JIRA_PROJECT is required for this operation');
    }
    
    return errors;
  }

  validate(): string[] {
    return [...this.validateGlobal(), ...this.validateProject()];
  }

  async isConfigured(): Promise<boolean> {
    await this.loadTokenFromKeychain();
    return this.validateGlobal().length === 0;
  }

  async isProjectConfigured(): Promise<boolean> {
    return this.validateProject().length === 0;
  }

  getCurrentProject(): string | undefined {
    return this.projectConfig.project;
  }

  /**
   * Check if configuration is fully available from environment variables
   * This helps determine if interactive setup can be skipped
   */
  isConfiguredViaEnvironment(): boolean {
    return !!(
      process.env.JIRA_HOST &&
      process.env.JIRA_EMAIL &&
      (process.env.JIRA_TOKEN || process.env.JIRA_API_TOKEN) &&
      process.env.JIRA_PROJECT
    );
  }

  /**
   * Get configuration status and sources for debugging
   */
  getConfigStatus(): {
    isComplete: boolean;
    sources: {
      host: 'env' | 'file' | 'missing';
      email: 'env' | 'file' | 'missing';
      apiToken: 'env' | 'keychain' | 'file' | 'missing';
      project: 'env' | 'file' | 'missing';
    };
    envVarsDetected: string[];
  } {
    const envVarsDetected = [];
    if (process.env.JIRA_HOST) envVarsDetected.push('JIRA_HOST');
    if (process.env.JIRA_EMAIL) envVarsDetected.push('JIRA_EMAIL');
    if (process.env.JIRA_TOKEN) envVarsDetected.push('JIRA_TOKEN');
    if (process.env.JIRA_API_TOKEN) envVarsDetected.push('JIRA_API_TOKEN');
    if (process.env.JIRA_PROJECT) envVarsDetected.push('JIRA_PROJECT');
    if (process.env.JIRA_BOARD) envVarsDetected.push('JIRA_BOARD');
    if (process.env.JIRA_DEFAULT_TYPE) envVarsDetected.push('JIRA_DEFAULT_TYPE');

    return {
      isComplete: this.validate().length === 0,
      sources: {
        host: process.env.JIRA_HOST ? 'env' : (this.globalConfig.host ? 'file' : 'missing'),
        email: process.env.JIRA_EMAIL ? 'env' : (this.globalConfig.email ? 'file' : 'missing'),
        apiToken: (process.env.JIRA_TOKEN || process.env.JIRA_API_TOKEN) ? 'env' : 
                 this.globalConfig.apiToken ? 'keychain' : 'missing',
        project: process.env.JIRA_PROJECT ? 'env' : (this.projectConfig.project ? 'file' : 'missing'),
      },
      envVarsDetected,
    };
  }

  getConfigSource(): { global: string; project: string | null } {
    const projectSearch = ConfigManager.explorer.search();
    
    return {
      global: ConfigManager.GLOBAL_CONFIG_PATH,
      project: projectSearch ? projectSearch.filepath : null,
    };
  }
}

// Maintain backward compatibility
export { ConfigManager as default };