import { BaseClient } from './base.js';
import { JiraConfig } from '../config/jira.js';
import { Logger } from '../utils/logger.js';
import {
  JiraIssue,
  JiraSearchResult,
  JiraTransition,
  JiraCreateIssue,
  JiraCreateMeta,
  JiraComment,
  JiraUser,
} from '../types/jira.js';
import { ADFBuilder } from '../utils/adf.js';


export interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey: string;
}

export interface SearchOptions {
  jql?: string;
  startAt?: number;
  maxResults?: number;
  fields?: string[];
  expand?: string[];
}

export interface CreateIssueOptions {
  summary: string;
  description?: string;
  issueType: string;
  priority?: string;
  labels?: string[];
  components?: string[];
  assignee?: string;
  customFields?: Record<string, any>;
}

export interface UpdateIssueOptions {
  summary?: string;
  description?: string;
  priority?: string;
  labels?: { add?: string[]; remove?: string[] };
  assignee?: string;
  customFields?: Record<string, any>;
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

  /**
   * Search for issues using JQL
   */
  async searchIssues(options: SearchOptions = {}): Promise<JiraSearchResult> {
    const params = new URLSearchParams();
    
    // Build JQL query
    let jql = options.jql || '';
    if (!jql) {
      // Default to current project
      jql = `project = ${this.config.project} ORDER BY updated DESC`;
    }
    
    params.append('jql', jql);
    
    if (options.startAt !== undefined) {
      params.append('startAt', options.startAt.toString());
    }
    
    if (options.maxResults !== undefined) {
      params.append('maxResults', options.maxResults.toString());
    }
    
    if (options.fields && options.fields.length > 0) {
      params.append('fields', options.fields.join(','));
    }
    
    if (options.expand && options.expand.length > 0) {
      params.append('expand', options.expand.join(','));
    }

    return this.request<JiraSearchResult>(`rest/api/3/search?${params.toString()}`);
  }

  /**
   * Get a single issue by key
   */
  async getIssue(issueKey: string, expand?: string[]): Promise<JiraIssue> {
    let url = `rest/api/3/issue/${issueKey}`;
    
    if (expand && expand.length > 0) {
      const params = new URLSearchParams();
      params.append('expand', expand.join(','));
      url += `?${params.toString()}`;
    }
    
    return this.request<JiraIssue>(url);
  }

  /**
   * Create a new issue
   */
  async createIssue(options: CreateIssueOptions): Promise<JiraIssue> {
    const createData: JiraCreateIssue = {
      fields: {
        project: {
          key: this.config.project,
        },
        summary: options.summary,
        issuetype: {
          name: options.issueType,
        },
      },
    };

    // Add description in ADF format
    if (options.description) {
      createData.fields.description = ADFBuilder.textToADF(options.description);
    }

    // Add optional fields
    if (options.priority) {
      createData.fields.priority = { name: options.priority };
    }

    if (options.labels && options.labels.length > 0) {
      createData.fields.labels = options.labels;
    }

    if (options.components && options.components.length > 0) {
      createData.fields.components = options.components.map(name => ({ name }));
    }

    if (options.assignee) {
      // Need to resolve user to accountId
      const user = await this.findUser(options.assignee);
      if (user) {
        createData.fields.assignee = { accountId: user.accountId };
      }
    }

    // Add custom fields
    if (options.customFields) {
      Object.assign(createData.fields, options.customFields);
    }

    try {
      return await this.request<JiraIssue>('rest/api/3/issue', {
        method: 'POST',
        json: createData,
      });
    } catch (error: any) {
      // Handle field not available errors
      if (error.response?.statusCode === 400 && error.response?.body) {
        const body = error.response.body;
        
        // Check if priority field is the issue
        if (body.errors?.priority && options.priority) {
          Logger.warning('Priority field not available in project, retrying without it');
          
          // Remove priority and retry
          delete createData.fields.priority;
          
          return await this.request<JiraIssue>('rest/api/3/issue', {
            method: 'POST',
            json: createData,
          });
        }
      }
      
      // Re-throw for other errors
      throw error;
    }
  }

  /**
   * Update an existing issue
   */
  async updateIssue(issueKey: string, options: UpdateIssueOptions): Promise<void> {
    const updateData: any = {
      fields: {},
    };

    if (options.summary) {
      updateData.fields.summary = options.summary;
    }

    if (options.description) {
      updateData.fields.description = ADFBuilder.textToADF(options.description);
    }

    if (options.priority) {
      updateData.fields.priority = { name: options.priority };
    }

    if (options.labels) {
      updateData.update = updateData.update || {};
      updateData.update.labels = [];
      
      if (options.labels.add) {
        options.labels.add.forEach(label => {
          updateData.update.labels.push({ add: label });
        });
      }
      
      if (options.labels.remove) {
        options.labels.remove.forEach(label => {
          updateData.update.labels.push({ remove: label });
        });
      }
    }

    if (options.assignee) {
      const user = await this.findUser(options.assignee);
      if (user) {
        updateData.fields.assignee = { accountId: user.accountId };
      }
    }

    if (options.customFields) {
      Object.assign(updateData.fields, options.customFields);
    }

    await this.request<void>(`rest/api/3/issue/${issueKey}`, {
      method: 'PUT',
      json: updateData,
    });
  }

  /**
   * Get available transitions for an issue
   */
  async getTransitions(issueKey: string): Promise<JiraTransition[]> {
    const response = await this.request<{ transitions: JiraTransition[] }>(
      `rest/api/3/issue/${issueKey}/transitions`
    );
    return response.transitions;
  }

  /**
   * Transition an issue to a new status
   */
  async transitionIssue(issueKey: string, transitionId: string, comment?: string): Promise<void> {
    const data: any = {
      transition: {
        id: transitionId,
      },
    };

    if (comment) {
      data.update = {
        comment: [
          {
            add: {
              body: ADFBuilder.textToADF(comment),
            },
          },
        ],
      };
    }

    await this.request<void>(`rest/api/3/issue/${issueKey}/transitions`, {
      method: 'POST',
      json: data,
    });
  }

  /**
   * Add a comment to an issue
   */
  async addComment(issueKey: string, comment: string): Promise<JiraComment> {
    const data = {
      body: ADFBuilder.textToADF(comment),
    };

    return this.request<JiraComment>(`rest/api/3/issue/${issueKey}/comment`, {
      method: 'POST',
      json: data,
    });
  }

  /**
   * Get comments for an issue
   */
  async getComments(issueKey: string): Promise<JiraComment[]> {
    const response = await this.request<{ comments: JiraComment[] }>(
      `rest/api/3/issue/${issueKey}/comment`
    );
    return response.comments;
  }

  /**
   * Find a user by email or name
   */
  async findUser(query: string): Promise<JiraUser | null> {
    try {
      const params = new URLSearchParams();
      
      // If it looks like an email, search by email
      if (query.includes('@')) {
        params.append('query', query);
      } else {
        params.append('query', query);
      }
      
      params.append('maxResults', '1');
      
      const users = await this.request<JiraUser[]>(`rest/api/3/user/search?${params.toString()}`);
      return users.length > 0 ? users[0] : null;
    } catch {
      return null;
    }
  }

  /**
   * Get create metadata for a project
   */
  async getCreateMeta(projectKey: string): Promise<JiraCreateMeta> {
    const params = new URLSearchParams();
    params.append('projectKeys', projectKey);
    params.append('expand', 'projects.issuetypes.fields');
    
    return this.request<JiraCreateMeta>(`rest/api/3/issue/createmeta?${params.toString()}`);
  }

  /**
   * Delete an issue
   */
  async deleteIssue(issueKey: string): Promise<void> {
    await this.request<void>(`rest/api/3/issue/${issueKey}`, {
      method: 'DELETE',
    });
  }
}