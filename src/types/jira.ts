export interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: JiraIssueFields;
  expand?: string;
}

export interface JiraIssueFields {
  summary: string;
  description?: any; // ADF format
  status: JiraStatus;
  issuetype: JiraIssueType;
  priority?: JiraPriority;
  assignee?: JiraUser;
  reporter?: JiraUser;
  created: string;
  updated: string;
  labels?: string[];
  components?: JiraComponent[];
  project: JiraProjectBasic;
  comment?: {
    comments: JiraComment[];
    total: number;
  };
  [key: string]: any; // For custom fields
}

export interface JiraStatus {
  self: string;
  description: string;
  iconUrl: string;
  name: string;
  id: string;
  statusCategory: {
    self: string;
    id: number;
    key: string;
    name: string;
    colorName: string;
  };
}

export interface JiraIssueType {
  self: string;
  id: string;
  description: string;
  iconUrl: string;
  name: string;
  subtask: boolean;
}

export interface JiraPriority {
  self: string;
  iconUrl: string;
  name: string;
  id: string;
}

export interface JiraUser {
  self: string;
  accountId: string;
  emailAddress: string;
  displayName: string;
  active: boolean;
}

export interface JiraProjectBasic {
  self: string;
  id: string;
  key: string;
  name: string;
}

export interface JiraComponent {
  self: string;
  id: string;
  name: string;
}

export interface JiraComment {
  self: string;
  id: string;
  author: JiraUser;
  body: any; // ADF format
  created: string;
  updated: string;
}

export interface JiraSearchResult {
  expand: string;
  startAt: number;
  maxResults: number;
  total: number;
  issues: JiraIssue[];
}

export interface JiraTransition {
  id: string;
  name: string;
  to: JiraStatus;
  hasScreen: boolean;
  isGlobal: boolean;
  isInitial: boolean;
  isConditional: boolean;
}

export interface JiraCreateIssue {
  fields: {
    project: {
      key: string;
    };
    summary: string;
    description?: any; // ADF format
    issuetype: {
      name: string;
    };
    priority?: {
      name: string;
    };
    labels?: string[];
    components?: Array<{ name: string }>;
    assignee?: {
      accountId: string;
    };
    [key: string]: any; // For custom fields
  };
}

export interface JiraCreateMeta {
  projects: Array<{
    id: string;
    key: string;
    name: string;
    issuetypes: Array<{
      self: string;
      id: string;
      description: string;
      iconUrl: string;
      name: string;
      subtask: boolean;
      fields: {
        [fieldName: string]: {
          required: boolean;
          name: string;
          fieldId: string;
          schema: {
            type: string;
            system?: string;
          };
          allowedValues?: any[];
        };
      };
    }>;
  }>;
}