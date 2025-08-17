import got, { Got } from 'got';
import { JiraConfig } from '../config/jira.js';
import { Logger } from '../utils/logger.js';

export class BaseClient {
  protected client: Got;
  protected config: JiraConfig;

  constructor(config: JiraConfig) {
    this.config = config;
    
    const baseUrl = `https://${config.host}`;
    
    this.client = got.extend({
      prefixUrl: baseUrl,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      username: config.email,
      password: config.apiToken,
      responseType: 'json',
      retry: {
        limit: 3,
        methods: ['GET', 'PUT', 'DELETE'],
        statusCodes: [408, 413, 429, 500, 502, 503, 504],
        errorCodes: ['ETIMEDOUT', 'ECONNRESET', 'EADDRINUSE', 'ECONNREFUSED', 'EPIPE', 'ENOTFOUND', 'ENETUNREACH', 'EAI_AGAIN'],
      },
      hooks: {
        beforeRequest: [
          (options) => {
            Logger.debug(`${options.method} ${options.url}`, {
              headers: options.headers,
              body: options.json,
            });
          },
        ],
        afterResponse: [
          (response) => {
            Logger.debug(`Response ${response.statusCode}`, {
              headers: response.headers,
              body: response.body,
            });
            
            // Handle rate limiting
            if (response.statusCode === 429) {
              const retryAfter = response.headers['retry-after'];
              if (retryAfter) {
                Logger.warning(`Rate limited. Retry after ${retryAfter} seconds`);
              }
            }
            
            return response;
          },
        ],
        beforeError: [
          (error) => {
            Logger.debug('Request error', error);
            return error;
          },
        ],
      },
    });
  }

  protected async request<T = any>(path: string, options?: any): Promise<T> {
    try {
      const response = await this.client(path, {
        ...options,
        responseType: 'json',
        resolveBodyOnly: true,
      });
      return response as T;
    } catch (error) {
      throw error;
    }
  }
}