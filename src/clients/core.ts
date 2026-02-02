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
  maxResults?: number;
  fields?: string[];
  expand?: string[];
  nextPageToken?: string;
}

export interface CreateIssueOptions {
  summary: string;
  description?: string;
  issueType: string;
  priority?: string;
  storyPoints?: number;
  labels?: string[];
  components?: string[];
  assignee?: string;
  parent?: string;
  epic?: string;
  customFields?: Record<string, any>;
}

export interface UpdateIssueOptions {
  summary?: string;
  description?: string;
  priority?: string;
  storyPoints?: number;
  labels?: { add?: string[]; remove?: string[] };
  assignee?: string;
  epic?: string;
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

    if (options.maxResults !== undefined) {
      params.append('maxResults', options.maxResults.toString());
    }

    // The new /search/jql endpoint defaults to returning only issue IDs.
    // Request *navigable to match the old /search endpoint behavior.
    if (options.fields && options.fields.length > 0) {
      params.append('fields', options.fields.join(','));
    } else {
      params.append('fields', '*navigable');
    }

    if (options.expand && options.expand.length > 0) {
      params.append('expand', options.expand.join(','));
    }

    if (options.nextPageToken) {
      params.append('nextPageToken', options.nextPageToken);
    }

    return this.request<JiraSearchResult>(`rest/api/3/search/jql?${params.toString()}`);
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

    // Add story points if provided
    if (options.storyPoints !== undefined) {
      // For creation, we'll try the common field first
      // Note: This might need adjustment based on the specific Jira instance
      createData.fields.customfield_10016 = options.storyPoints;
    }

    if (options.labels && options.labels.length > 0) {
      createData.fields.labels = options.labels;
    }

    if (options.components && options.components.length > 0) {
      createData.fields.components = options.components.map(name => ({ name }));
    }

    // Add parent field for sub-tasks
    if (options.parent) {
      createData.fields.parent = { key: options.parent };
    }

    // Add Epic Link field
    if (options.epic) {
      const epicLinkField = await this.getEpicLinkField();
      if (epicLinkField) {
        if (epicLinkField === 'parent') {
          // For parent field, use object format with key
          createData.fields[epicLinkField] = { key: options.epic };
        } else {
          // For custom Epic Link fields, use string value
          createData.fields[epicLinkField] = options.epic;
        }
      } else {
        Logger.warning(`Epic Link field not found - Epic Links may not be configured for project ${this.config.project}`);
      }
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
        
        // Provide detailed error information
        Logger.debug('400 Error details:', JSON.stringify(body, null, 2));
        
        let retryNeeded = false;
        const fieldErrors: string[] = [];
        
        // Check for specific field errors and provide solutions
        if (body.errors) {
          // Priority field error
          if (body.errors.priority && options.priority) {
            Logger.warning('Priority field not available in project, removing it');
            delete createData.fields.priority;
            retryNeeded = true;
          }
          
          // Story points field error - try different common fields
          if (body.errors.customfield_10016 && options.storyPoints !== undefined) {
            Logger.warning('Story points field customfield_10016 not available, trying customfield_10002');
            delete createData.fields.customfield_10016;
            createData.fields.customfield_10002 = options.storyPoints;
            retryNeeded = true;
          } else if (body.errors.customfield_10002 && options.storyPoints !== undefined) {
            Logger.warning('Story points field customfield_10002 not available, removing story points');
            delete createData.fields.customfield_10002;
            retryNeeded = true;
          }
          
          // Issue type error
          if (body.errors.issuetype) {
            fieldErrors.push(`Issue Type: ${body.errors.issuetype}`);
          }
          
          // Components error
          if (body.errors.components && options.components) {
            Logger.warning('Components field not available in project, removing it');
            delete createData.fields.components;
            retryNeeded = true;
          }
          
          // Parent error (for sub-tasks)
          if (body.errors.parent) {
            fieldErrors.push(`Parent: ${body.errors.parent}`);
          }
          
          // Epic Link field errors - try different Epic Link fields
          const epicLinkFields = ['customfield_10014', 'customfield_10013', 'customfield_10015', 'customfield_10009'];
          let epicLinkErrorFound = false;
          for (const field of epicLinkFields) {
            if (body.errors[field] && options.epic !== undefined) {
              if (!epicLinkErrorFound) {
                Logger.warning(`Epic Link field ${field} not available, trying alternative fields`);
                delete createData.fields[field];
                
                // Try next common Epic Link field
                const nextField = epicLinkFields[epicLinkFields.indexOf(field) + 1];
                if (nextField) {
                  createData.fields[nextField] = options.epic;
                  retryNeeded = true;
                  epicLinkErrorFound = true;
                } else {
                  Logger.warning('No Epic Link field found, removing Epic Link');
                  // Remove all potential Epic Link fields
                  epicLinkFields.forEach(f => delete createData.fields[f]);
                }
              }
            }
          }
          
          // Collect other field errors
          const ignoredFields = ['priority', 'customfield_10016', 'customfield_10002', 'components', ...epicLinkFields];
          Object.keys(body.errors).forEach(field => {
            if (!ignoredFields.includes(field)) {
              fieldErrors.push(`${field}: ${body.errors[field]}`);
            }
          });
        }
        
        // If we can retry, try again
        if (retryNeeded) {
          Logger.debug('Retrying create with modified fields');
          return await this.request<JiraIssue>('rest/api/3/issue', {
            method: 'POST',
            json: createData,
          });
        }
        
        // If there are field errors, throw a detailed error
        if (fieldErrors.length > 0) {
          const errorMessage = `Issue creation failed with field errors:\n${fieldErrors.join('\n')}`;
          if (body.errorMessages && body.errorMessages.length > 0) {
            throw new Error(`${errorMessage}\n\nGeneral errors:\n${body.errorMessages.join('\n')}`);
          }
          throw new Error(errorMessage);
        }
        
        // If there are general error messages, include them
        if (body.errorMessages && body.errorMessages.length > 0) {
          throw new Error(`Issue creation failed:\n${body.errorMessages.join('\n')}`);
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

    if (options.storyPoints !== undefined) {
      // Try to find the correct story points field by checking common custom field IDs
      const storyPointsField = await this.getStoryPointsField(issueKey);
      if (storyPointsField) {
        updateData.fields[storyPointsField] = options.storyPoints;
      } else {
        Logger.warning('Story points field not found. Trying common field customfield_10016');
        updateData.fields.customfield_10016 = options.storyPoints;
      }
    }

    if (options.epic !== undefined) {
      // Try to find the correct Epic Link field by checking field metadata
      const epicLinkField = await this.getEpicLinkField(issueKey);
      if (epicLinkField) {
        if (epicLinkField === 'parent') {
          // For parent field, use object format with key
          if (options.epic === null || options.epic === '') {
            updateData.fields[epicLinkField] = null;
          } else {
            updateData.fields[epicLinkField] = { key: options.epic };
          }
        } else {
          // For custom Epic Link fields, use string value
          updateData.fields[epicLinkField] = options.epic;
        }
      } else {
        throw new Error(`Epic Link field not found - Epic Links may not be configured for project ${this.config.project}. Please contact your Jira administrator to enable Epic Links.`);
      }
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
   * Get available issue types for a project
   */
  async getProjectIssueTypes(projectKey: string): Promise<any[]> {
    try {
      // First try the create metadata endpoint
      const params = new URLSearchParams();
      params.append('projectKeys', projectKey);
      params.append('expand', 'projects.issuetypes');
      
      const createMeta = await this.request<any>(
        `rest/api/3/issue/createmeta?${params.toString()}`
      );
      
      if (createMeta.projects && createMeta.projects[0]) {
        return createMeta.projects[0].issuetypes || [];
      }
      
      // Fallback to project endpoint
      const project = await this.request<any>(`rest/api/3/project/${projectKey}`);
      return project.issueTypes || [];
      
    } catch (error: any) {
      Logger.debug('Failed to fetch issue types:', error);
      
      // Last fallback - try to get from project details
      try {
        const project = await this.getProject(projectKey);
        return (project as any).issueTypes || [];
      } catch {
        return [];
      }
    }
  }

  /**
   * Delete an issue
   */
  async deleteIssue(issueKey: string): Promise<void> {
    await this.request<void>(`rest/api/3/issue/${issueKey}`, {
      method: 'DELETE',
    });
  }

  /**
   * Convert an issue to a sub-task of a parent issue
   * This tries multiple approaches as different Jira configurations support different methods
   */
  async convertToSubtask(issueKey: string, parentKey: string): Promise<void> {
    Logger.debug(`Converting ${issueKey} to sub-task of ${parentKey}`);
    
    // First, get the issue to get project info
    const issue = await this.getIssue(issueKey);
    const projectKey = issue.fields.project.key;
    
    // Check if it's already the right type and just needs parent
    if (issue.fields.issuetype?.subtask || issue.fields.issuetype?.name?.toLowerCase().includes('sub')) {
      Logger.debug('Issue is already a sub-task type, just setting parent');
      try {
        const updateData = {
          fields: {
            parent: { key: parentKey }
          }
        };
        
        await this.request<void>(`rest/api/3/issue/${issueKey}`, {
          method: 'PUT',
          json: updateData,
        });
        return;
      } catch (error: any) {
        Logger.debug('Failed to set parent on existing sub-task:', error.response?.body);
      }
    }
    
    // Get available issue types for the project
    let subtaskType = null;
    try {
      // Try to get create metadata which includes available issue types
      const createMeta = await this.request<any>(
        `rest/api/3/issue/createmeta?projectKeys=${projectKey}&expand=projects.issuetypes`
      );
      
      if (createMeta.projects && createMeta.projects[0]) {
        const project = createMeta.projects[0];
        subtaskType = project.issuetypes?.find(
          (type: any) => type.subtask === true || type.name?.toLowerCase() === 'sub-task'
        );
      }
    } catch (error) {
      Logger.debug('Could not fetch create metadata');
    }
    
    // Fallback: try to get project details
    if (!subtaskType) {
      try {
        const projectMeta = await this.request<any>(`rest/api/3/project/${projectKey}`);
        if (projectMeta.issueTypes) {
          subtaskType = projectMeta.issueTypes.find(
            (type: any) => type.subtask === true || type.name?.toLowerCase() === 'sub-task'
          );
        }
      } catch (error) {
        Logger.debug('Could not fetch project metadata');
      }
    }
    
    if (!subtaskType) {
      // Last resort: try common sub-task type names
      subtaskType = { name: 'Sub-task' };
    }

    // Try different update approaches
    try {
      // Approach 1: Update both fields together
      Logger.debug('Trying to update type and parent together');
      const updateData = {
        fields: {
          issuetype: { 
            id: subtaskType.id || undefined,
            name: subtaskType.name 
          },
          parent: { key: parentKey }
        }
      };

      await this.request<void>(`rest/api/3/issue/${issueKey}`, {
        method: 'PUT',
        json: updateData,
      });
    } catch (error: any) {
      // If standard update fails, try the move endpoint
      if (error.response?.statusCode === 400) {
        const errorBody = error.response.body;
        
        // Check for specific error messages
        if (errorBody?.errors?.issuetype) {
          throw new Error(`Cannot convert to Sub-task: ${errorBody.errors.issuetype}`);
        }
        if (errorBody?.errors?.parent) {
          throw new Error(`Cannot set parent: ${errorBody.errors.parent}`);
        }
        
        Logger.debug('Standard update failed, trying move endpoint');
        
        // Try a simpler approach - just set parent if type is already Sub-task
        if (issue.fields.issuetype?.name?.toLowerCase().includes('sub')) {
          const simpleUpdate = {
            fields: {
              parent: { key: parentKey }
            }
          };
          
          try {
            await this.request<void>(`rest/api/3/issue/${issueKey}`, {
              method: 'PUT',
              json: simpleUpdate,
            });
            return;
          } catch (simpleError: any) {
            Logger.debug('Simple parent update also failed');
          }
        }
        
        // Last resort: try move endpoint
        const moveData = {
          fields: {
            project: { key: projectKey },
            issuetype: { name: 'Sub-task' },
            parent: { key: parentKey }
          }
        };

        try {
          await this.request<void>(`rest/api/3/issue/${issueKey}/move`, {
            method: 'POST',
            json: moveData,
          });
        } catch (moveError: any) {
          if (moveError.response?.statusCode === 404) {
            throw new Error(
              'Issue type conversion not supported in this Jira instance.\n' +
              '\nWorkaround options:\n' +
              `1. Create a new sub-task: jira create --type Sub-task --summary "<summary>" --parent ${parentKey}\n` +
              '2. Link the issues: Use Jira web UI to create a "relates to" link\n' +
              `3. Clone as sub-task: In Jira web UI, clone ${issueKey} as a Sub-task of ${parentKey}`
            );
          }
          throw moveError;
        }
      } else if (error.response?.statusCode === 404) {
        throw new Error(`Issue ${issueKey} not found`);
      } else {
        throw error;
      }
    }
  }

  /**
   * Smart transition discovery - find transition to target status
   */
  async findTransitionToStatus(issueKey: string, targetStatus: string): Promise<{ transitionId: string; transitionName: string } | null> {
    try {
      const transitions = await this.getTransitions(issueKey);
      
      // Find direct transition to target status
      const directTransition = transitions.find(t => 
        t.to.name.toLowerCase() === targetStatus.toLowerCase()
      );
      
      if (directTransition) {
        return {
          transitionId: directTransition.id,
          transitionName: directTransition.name
        };
      }
      
      return null;
    } catch (error) {
      Logger.debug('Error finding transition to status:', error);
      return null;
    }
  }

  /**
   * Find the correct story points custom field for this instance
   */
  private async getStoryPointsField(issueKey: string): Promise<string | null> {
    try {
      // Get the issue to examine its fields
      const issue = await this.getIssue(issueKey);
      
      // Common story points field names
      const storyPointFields = [
        'customfield_10016',
        'customfield_10002',
        'customfield_10004', 
        'customfield_10008',
        'story_point_estimate',
        'storyPoints'
      ];

      // Check which field exists and has numeric content
      for (const field of storyPointFields) {
        if (issue.fields[field] !== undefined) {
          return field;
        }
      }

      // If no existing value found, try to get field metadata
      try {
        const meta = await this.request<any>(`rest/api/3/issue/${issueKey}/editmeta`);
        const fields = meta?.fields || {};
        
        for (const [fieldId, fieldMeta] of Object.entries(fields)) {
          const fieldName = (fieldMeta as any)?.name?.toLowerCase() || '';
          if (fieldName.includes('story') && fieldName.includes('point')) {
            return fieldId;
          }
        }
      } catch (metaError) {
        Logger.debug('Could not fetch edit metadata for story points field detection');
      }

      return null;
    } catch (error) {
      Logger.debug('Error detecting story points field:', error);
      return null;
    }
  }

  /**
   * Find the correct Epic Link field for this instance
   * In newer Jira instances, Epic Links often use the standard 'parent' field
   */
  private async getEpicLinkField(issueKey?: string): Promise<string | null> {
    try {
      // Check if we can use the standard parent field for Epic Links
      if (issueKey) {
        try {
          const issue = await this.getIssue(issueKey);
          
          // Check if this issue already has a parent that's an Epic
          if (issue.fields.parent && issue.fields.parent.fields?.issuetype?.name?.toLowerCase() === 'epic') {
            Logger.debug('Found Epic Link using standard parent field');
            return 'parent';
          }
          
          // Check edit metadata to see if parent field is available and can link to Epics
          const meta = await this.request<any>(`rest/api/3/issue/${issueKey}/editmeta`);
          const fields = meta?.fields || {};
          
          // Check if parent field exists and can be used for Epic linking
          if (fields.parent) {
            Logger.debug('Found parent field in edit metadata - can be used for Epic Links');
            return 'parent';
          }
          
          // Look for custom Epic Link fields
          for (const [fieldId, fieldMeta] of Object.entries(fields)) {
            const fieldName = (fieldMeta as any)?.name?.toLowerCase() || '';
            if (fieldName.includes('epic') && (fieldName.includes('link') || fieldName.includes('name'))) {
              Logger.debug(`Found custom Epic Link field: ${fieldId} (${(fieldMeta as any)?.name})`);
              return fieldId;
            }
          }
        } catch (error) {
          Logger.debug('Could not fetch issue/edit metadata for Epic Link field detection');
        }
      }

      // Try to get field metadata from create meta
      try {
        const meta = await this.request<any>(`rest/api/3/issue/createmeta?projectKeys=${this.config.project}&expand=projects.issuetypes.fields`);
        const project = meta?.projects?.[0];
        const issueTypes = project?.issuetypes || [];
        
        // Look through story/task issue types for Epic Link field
        for (const issueType of issueTypes) {
          if (issueType.name?.toLowerCase().includes('story') || issueType.name?.toLowerCase().includes('task')) {
            const fields = issueType.fields || {};
            
            // Check if parent field is available for this issue type
            if (fields.parent) {
              Logger.debug('Found parent field in create meta - can be used for Epic Links');
              return 'parent';
            }
            
            // Look for custom Epic Link fields
            for (const [fieldId, fieldMeta] of Object.entries(fields)) {
              const fieldName = (fieldMeta as any)?.name?.toLowerCase() || '';
              if (fieldName.includes('epic') && (fieldName.includes('link') || fieldName.includes('name'))) {
                Logger.debug(`Found custom Epic Link field in create meta: ${fieldId} (${(fieldMeta as any)?.name})`);
                return fieldId;
              }
            }
            break; // Found a story/task type, no need to check others
          }
        }
      } catch (metaError) {
        Logger.debug('Could not fetch create metadata for Epic Link field detection');
      }

      // If no Epic Link field found, this project may not support Epic Links
      Logger.debug('No Epic Link field found in project metadata - Epic Links may not be configured for this project');
      return null;
    } catch (error) {
      Logger.debug('Error detecting Epic Link field:', error);
      return null;
    }
  }

  // Issue Linking Methods

  /**
   * Get available issue link types
   */
  async getIssueLinkTypes(): Promise<any> {
    try {
      const response = await this.request<any>('rest/api/3/issueLinkType');
      return response.issueLinkTypes || [];
    } catch (error) {
      throw new Error(`Failed to fetch issue link types: ${error}`);
    }
  }

  /**
   * Create a link between two issues
   */
  async createIssueLink(inwardIssue: string, outwardIssue: string, linkType: string, comment?: string): Promise<{ success: boolean; commentWarning?: string }> {
    try {
      // First, create the link without comment
      const linkData: any = {
        type: { name: linkType },
        inwardIssue: { key: inwardIssue },
        outwardIssue: { key: outwardIssue }
      };

      await this.request<void>('rest/api/3/issueLink', {
        method: 'POST',
        json: linkData,
      });

      // If comment provided, try to add it as a separate operation
      let commentWarning: string | undefined;
      if (comment) {
        try {
          await this.addComment(outwardIssue, comment);
        } catch (commentError: any) {
          // Comment failed, but link succeeded - make this non-blocking
          commentWarning = `Link created successfully, but failed to add comment: ${commentError.message}`;
        }
      }

      return { success: true, commentWarning };
    } catch (error: any) {
      if (error.response?.statusCode === 404) {
        throw new Error(`One or both issues not found: ${inwardIssue}, ${outwardIssue}`);
      } else if (error.response?.statusCode === 400) {
        const errorData = error.response?.body;
        if (errorData?.errors?.type) {
          throw new Error(`Invalid link type "${linkType}". Use 'jira link types' to see available types.`);
        }
        throw new Error(`Failed to create link: ${errorData?.errorMessages?.[0] || error.message}`);
      }
      throw new Error(`Failed to create issue link: ${error.message}`);
    }
  }

  /**
   * Delete an issue link by finding it between two issues
   */
  async deleteIssueLink(issueKey1: string, issueKey2: string, linkType?: string): Promise<void> {
    try {
      // Get the first issue to find links
      const issue = await this.getIssue(issueKey1);
      const links = issue.fields.issuelinks || [];

      // Find the link to delete
      let linkToDelete = null;
      for (const link of links) {
        const isOutward = link.outwardIssue?.key === issueKey2;
        const isInward = link.inwardIssue?.key === issueKey2;
        
        if (isOutward || isInward) {
          // If linkType specified, check it matches
          if (linkType && link.type.name !== linkType) {
            continue;
          }
          linkToDelete = link;
          break;
        }
      }

      if (!linkToDelete) {
        throw new Error(`No link found between ${issueKey1} and ${issueKey2}${linkType ? ` of type "${linkType}"` : ''}`);
      }

      await this.request<void>(`rest/api/3/issueLink/${linkToDelete.id}`, {
        method: 'DELETE',
      });
    } catch (error: any) {
      if (error.message.includes('No link found')) {
        throw error; // Re-throw our specific error
      }
      throw new Error(`Failed to delete issue link: ${error.message}`);
    }
  }

  /**
   * Get all links for a specific issue
   */
  async getIssueLinks(issueKey: string): Promise<any[]> {
    try {
      const issue = await this.getIssue(issueKey, ['issuelinks']);
      return issue.fields.issuelinks || [];
    } catch (error: any) {
      if (error.response?.statusCode === 404) {
        throw new Error(`Issue ${issueKey} not found`);
      }
      throw new Error(`Failed to get issue links: ${error.message}`);
    }
  }
}