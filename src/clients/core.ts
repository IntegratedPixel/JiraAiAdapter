import { BaseClient } from './base.js';
import { JiraConfig } from '../config/jira.js';
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

    return this.request<JiraIssue>('rest/api/3/issue', {
      method: 'POST',
      json: createData,
    });
  }

  /**
   * Update an existing issue (generic method)
   */
  async updateIssue(issueKey: string, updates: any): Promise<void> {
    await this.request<void>(`rest/api/3/issue/${issueKey}`, {
      method: 'PUT',
      json: updates,
    });
  }

  /**
   * Update an existing issue with options
   */
  async updateIssueWithOptions(issueKey: string, options: UpdateIssueOptions): Promise<void> {
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

    await this.updateIssue(issueKey, updateData);
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
   * Add a comment to an issue (accepts ADF body)
   */
  async addComment(issueKey: string, body: any): Promise<JiraComment> {
    return this.request<JiraComment>(`rest/api/3/issue/${issueKey}/comment`, {
      method: 'POST',
      json: { body },
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
   * Get current user
   */
  async getCurrentUser(): Promise<JiraUser> {
    return this.request<JiraUser>('rest/api/3/myself');
  }

  /**
   * Search for users
   */
  async searchUsers(query: string): Promise<JiraUser[]> {
    const params = new URLSearchParams();
    params.append('query', query);
    params.append('maxResults', '10');
    
    return this.request<JiraUser[]>(`rest/api/3/user/search?${params.toString()}`);
  }

  /**
   * Get boards for a project (Agile API)
   */
  async getBoards(projectKey?: string): Promise<any[]> {
    const params = new URLSearchParams();
    if (projectKey) {
      params.append('projectKeyOrId', projectKey);
    }
    params.append('maxResults', '50');
    
    const response = await this.request<{ values: any[] }>(
      `rest/agile/1.0/board?${params.toString()}`
    );
    return response.values;
  }

  /**
   * Get board by name
   */
  async getBoardByName(name: string): Promise<any | null> {
    const params = new URLSearchParams();
    params.append('name', name);
    params.append('maxResults', '1');
    
    const response = await this.request<{ values: any[] }>(
      `rest/agile/1.0/board?${params.toString()}`
    );
    return response.values.length > 0 ? response.values[0] : null;
  }

  /**
   * Get sprints for a board
   */
  async getSprints(boardId: number): Promise<any[]> {
    const params = new URLSearchParams();
    params.append('maxResults', '50');
    
    const response = await this.request<{ values: any[] }>(
      `rest/agile/1.0/board/${boardId}/sprint?${params.toString()}`
    );
    return response.values;
  }

  /**
   * Get issues in a sprint
   */
  async getSprintIssues(boardId: number, sprintId: number, fields?: string[]): Promise<JiraIssue[]> {
    const params = new URLSearchParams();
    params.append('maxResults', '100');
    if (fields && fields.length > 0) {
      params.append('fields', fields.join(','));
    }
    
    const response = await this.request<{ issues: JiraIssue[] }>(
      `rest/agile/1.0/board/${boardId}/sprint/${sprintId}/issue?${params.toString()}`
    );
    return response.issues;
  }

  /**
   * Upload an attachment to an issue
   */
  async uploadAttachment(issueKey: string, filePath: string): Promise<any> {
    const FormData = (await import('form-data')).default;
    const { createReadStream } = await import('fs');
    const { basename } = await import('path');
    
    const form = new FormData();
    form.append('file', createReadStream(filePath), basename(filePath));

    const response = await this.request<any[]>(
      `rest/api/3/issue/${issueKey}/attachments`,
      {
        method: 'POST',
        headers: {
          'X-Atlassian-Token': 'no-check',
          ...form.getHeaders()
        },
        body: form
      }
    );

    return response[0]; // Jira returns an array of attachments
  }

  /**
   * Create an issue link
   */
  async createIssueLink(fromKey: string, toKey: string, linkType: string): Promise<void> {
    await this.request(
      'rest/api/3/issueLink',
      {
        method: 'POST',
        json: {
          type: { name: linkType },
          inwardIssue: { key: fromKey },
          outwardIssue: { key: toKey }
        }
      }
    );
  }

  /**
   * Get issue link types
   */
  async getIssueLinkTypes(): Promise<any[]> {
    const response = await this.request<{ issueLinkTypes: any[] }>(
      'rest/api/3/issueLinkType'
    );
    return response.issueLinkTypes;
  }

  /**
   * Watch/unwatch an issue
   */
  async watchIssue(issueKey: string, watch: boolean = true): Promise<void> {
    const method = watch ? 'POST' : 'DELETE';
    await this.request(
      `rest/api/3/issue/${issueKey}/watchers`,
      {
        method,
        json: watch ? { accountId: (await this.getCurrentUser()).accountId } : undefined
      }
    );
  }

  /**
   * Get watchers for an issue
   */
  async getWatchers(issueKey: string): Promise<any> {
    return this.request(`rest/api/3/issue/${issueKey}/watchers`);
  }
}