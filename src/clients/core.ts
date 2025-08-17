import { BaseClient } from './base.js';
import { JiraConfig } from '../config/jira.js';

export interface JiraUser {
  accountId: string;
  emailAddress: string;
  displayName: string;
  self: string;
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey: string;
}

export class CoreClient extends BaseClient {
  constructor(config: JiraConfig) {
    super(config);
  }

  async testConnection(): Promise<JiraUser> {
    return this.request<JiraUser>('rest/api/3/myself');
  }

  async getProjects(): Promise<JiraProject[]> {
    return this.request<JiraProject[]>('rest/api/3/project');
  }

  async getProject(projectKey: string): Promise<JiraProject> {
    return this.request<JiraProject>(`rest/api/3/project/${projectKey}`);
  }
}