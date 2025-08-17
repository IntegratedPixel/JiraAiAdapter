import chalk from 'chalk';
import ora, { Ora } from 'ora';

export class Logger {
  private static debugMode = false;
  private static quietMode = false;
  private static jsonMode = false;
  private static spinner: Ora | null = null;

  static setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }

  static setQuietMode(enabled: boolean): void {
    this.quietMode = enabled;
  }

  static setJsonMode(enabled: boolean): void {
    this.jsonMode = enabled;
    // Disable spinner in JSON mode
    if (enabled && this.spinner) {
      this.spinner.stop();
      this.spinner = null;
    }
  }

  static debug(message: string, data?: any): void {
    if (this.debugMode && !this.jsonMode) {
      console.error(chalk.gray(`[DEBUG] ${message}`));
      if (data) {
        // Redact sensitive information
        const redacted = this.redactSensitive(data);
        console.error(chalk.gray(JSON.stringify(redacted, null, 2)));
      }
    }
  }

  static info(message: string): void {
    if (!this.quietMode && !this.jsonMode) {
      console.log(message);
    }
  }

  static success(message: string): void {
    if (!this.quietMode && !this.jsonMode) {
      console.log(chalk.green('✓'), message);
    }
  }

  static warning(message: string): void {
    if (!this.jsonMode) {
      console.error(chalk.yellow('⚠'), message);
    }
  }

  static error(message: string, error?: Error): void {
    if (!this.jsonMode) {
      console.error(chalk.red('✗'), message);
      if (error && this.debugMode) {
        console.error(chalk.red(error.stack || error.message));
      }
    }
  }

  static startSpinner(message: string): void {
    if (!this.quietMode && !this.jsonMode) {
      this.spinner = ora(message).start();
    }
  }

  static stopSpinner(success: boolean = true, message?: string): void {
    if (this.spinner) {
      if (success) {
        this.spinner.succeed(message);
      } else {
        this.spinner.fail(message);
      }
      this.spinner = null;
    }
  }

  static json(data: any): void {
    if (this.jsonMode) {
      console.log(JSON.stringify(data, null, 2));
    }
  }

  static table(data: any[]): void {
    if (!this.jsonMode && !this.quietMode) {
      console.table(data);
    }
  }

  private static redactSensitive(obj: any): any {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    const redacted = Array.isArray(obj) ? [...obj] : { ...obj };
    const sensitiveKeys = ['apiToken', 'token', 'password', 'apiKey', 'secret', 'authorization'];

    for (const key in redacted) {
      if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
        redacted[key] = '[REDACTED]';
      } else if (typeof redacted[key] === 'object') {
        redacted[key] = this.redactSensitive(redacted[key]);
      }
    }

    // Redact headers
    if (redacted.headers) {
      const headers = { ...redacted.headers };
      if (headers.authorization) {
        headers.authorization = '[REDACTED]';
      }
      if (headers.Authorization) {
        headers.Authorization = '[REDACTED]';
      }
      redacted.headers = headers;
    }

    return redacted;
  }
}