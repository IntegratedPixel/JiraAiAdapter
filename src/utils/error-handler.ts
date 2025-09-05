import { Logger } from './logger.js';

export enum ErrorCode {
  INVALID_ARGS = 'INVALID_ARGS',
  AUTH = 'AUTH',
  NOT_FOUND = 'NOT_FOUND',
  RATE_LIMIT = 'RATE_LIMIT',
  NETWORK = 'NETWORK',
  UNKNOWN = 'UNKNOWN',
}

export const EXIT_CODES = {
  SUCCESS: 0,
  UNKNOWN_ERROR: 1,
  INVALID_ARGS: 2,
  AUTH_ERROR: 3,
  NOT_FOUND: 4,
  RATE_LIMIT: 5,
  NETWORK_ERROR: 6,
} as const;

export interface JsonError {
  ok: false;
  data: null;
  error: {
    code: ErrorCode;
    message: string;
    details?: any;
  };
}

export interface JsonSuccess<T = any> {
  ok: true;
  data: T;
  error: null;
}

export type JsonResponse<T = any> = JsonSuccess<T> | JsonError;

export class ErrorHandler {
  static handle(error: any): never {
    Logger.stopSpinner(false);

    let code: ErrorCode = ErrorCode.UNKNOWN;
    let exitCode: number = EXIT_CODES.UNKNOWN_ERROR;
    let message: string = 'An unexpected error occurred';
    const details: any = {};

    if (error.response) {
      // HTTP error response
      const status = error.response.statusCode || error.response.status;
      const body = error.response.body || error.response.data;

      if (status === 401 || status === 403) {
        code = ErrorCode.AUTH;
        exitCode = EXIT_CODES.AUTH_ERROR;
        message = 'Authentication failed. Please check your credentials.';
      } else if (status === 404) {
        code = ErrorCode.NOT_FOUND;
        exitCode = EXIT_CODES.NOT_FOUND;
        message = 'Issue does not exist or you do not have permission to see it.';
      } else if (status === 429) {
        code = ErrorCode.RATE_LIMIT;
        exitCode = EXIT_CODES.RATE_LIMIT;
        message = 'Rate limit exceeded. Please try again later.';
        if (error.response.headers?.['retry-after']) {
          details.retryAfter = error.response.headers['retry-after'];
        }
      } else {
        code = ErrorCode.NETWORK;
        exitCode = EXIT_CODES.NETWORK_ERROR;
        message = `HTTP ${status} error`;
      }

      if (body?.errorMessages) {
        message = body.errorMessages.join(', ');
      } else if (body?.message) {
        message = body.message;
      }

      details.status = status;
      if (body) {
        details.response = body;
      }
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      code = ErrorCode.NETWORK;
      exitCode = EXIT_CODES.NETWORK_ERROR;
      message = 'Network error. Please check your connection and JIRA_HOST configuration.';
      details.code = error.code;
    } else if (error.message?.includes('Configuration')) {
      code = ErrorCode.INVALID_ARGS;
      exitCode = EXIT_CODES.INVALID_ARGS;
      message = error.message;
    } else {
      message = error.message || message;
    }

    if (Logger['jsonMode']) {
      const response: JsonError = {
        ok: false,
        data: null,
        error: {
          code,
          message,
          details,
        },
      };
      Logger.json(response);
    } else {
      Logger.error(message, error);
    }

    process.exit(exitCode);
  }

  static success<T>(data: T): void {
    if (Logger['jsonMode']) {
      const response: JsonSuccess<T> = {
        ok: true,
        data,
        error: null,
      };
      Logger.json(response);
    }
  }
}