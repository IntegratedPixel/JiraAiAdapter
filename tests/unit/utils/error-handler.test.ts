import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ErrorHandler, ErrorCode, EXIT_CODES } from '../../../src/utils/error-handler.js';
import { Logger } from '../../../src/utils/logger.js';

describe('ErrorHandler', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    vi.spyOn(Logger, 'stopSpinner').mockImplementation(() => {});
    vi.spyOn(Logger, 'error').mockImplementation(() => {});
    vi.spyOn(Logger, 'json').mockImplementation(() => {});
    vi.spyOn(Logger, 'isJsonMode').mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('EXIT_CODES', () => {
    it('should have the correct exit code values', () => {
      expect(EXIT_CODES.SUCCESS).toBe(0);
      expect(EXIT_CODES.UNKNOWN_ERROR).toBe(1);
      expect(EXIT_CODES.INVALID_ARGS).toBe(2);
      expect(EXIT_CODES.AUTH_ERROR).toBe(3);
      expect(EXIT_CODES.NOT_FOUND).toBe(4);
      expect(EXIT_CODES.RATE_LIMIT).toBe(5);
      expect(EXIT_CODES.NETWORK_ERROR).toBe(6);
    });
  });

  describe('handle', () => {
    it('should handle 400 errors as INVALID_ARGS', () => {
      const error = { response: { statusCode: 400, body: null } };
      ErrorHandler.handle(error);
      expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.INVALID_ARGS);
    });

    it('should handle 401 errors as AUTH', () => {
      const error = { response: { statusCode: 401, body: null } };
      ErrorHandler.handle(error);
      expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.AUTH_ERROR);
    });

    it('should handle 403 errors as AUTH', () => {
      const error = { response: { statusCode: 403, body: null } };
      ErrorHandler.handle(error);
      expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.AUTH_ERROR);
    });

    it('should handle 404 errors as NOT_FOUND', () => {
      const error = { response: { statusCode: 404, body: null } };
      ErrorHandler.handle(error);
      expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.NOT_FOUND);
    });

    it('should handle 429 errors as RATE_LIMIT', () => {
      const error = { response: { statusCode: 429, body: null, headers: {} } };
      ErrorHandler.handle(error);
      expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.RATE_LIMIT);
    });

    it('should handle 429 with retry-after header', () => {
      const error = {
        response: { statusCode: 429, body: null, headers: { 'retry-after': '30' } },
      };
      ErrorHandler.handle(error);
      expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.RATE_LIMIT);
    });

    it('should handle 500+ errors as NETWORK', () => {
      const error = { response: { statusCode: 500, body: null } };
      ErrorHandler.handle(error);
      expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.NETWORK_ERROR);
    });

    it('should handle 502 errors as NETWORK', () => {
      const error = { response: { statusCode: 502, body: null } };
      ErrorHandler.handle(error);
      expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.NETWORK_ERROR);
    });

    it('should extract error messages from response body', () => {
      const error = {
        response: { statusCode: 400, body: { errorMessages: ['Field required', 'Bad value'] } },
      };
      ErrorHandler.handle(error);
      expect(Logger.error).toHaveBeenCalledWith(
        'Field required, Bad value',
        expect.anything(),
      );
    });

    it('should handle ENOTFOUND as NETWORK error', () => {
      const error = { code: 'ENOTFOUND' };
      ErrorHandler.handle(error);
      expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.NETWORK_ERROR);
    });

    it('should handle ECONNREFUSED as NETWORK error', () => {
      const error = { code: 'ECONNREFUSED' };
      ErrorHandler.handle(error);
      expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.NETWORK_ERROR);
    });

    it('should handle ETIMEDOUT as NETWORK error', () => {
      const error = { code: 'ETIMEDOUT' };
      ErrorHandler.handle(error);
      expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.NETWORK_ERROR);
    });

    it('should handle ECONNRESET as NETWORK error', () => {
      const error = { code: 'ECONNRESET' };
      ErrorHandler.handle(error);
      expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.NETWORK_ERROR);
    });

    it('should handle Configuration errors as INVALID_ARGS', () => {
      const error = { message: 'Configuration incomplete: missing host' };
      ErrorHandler.handle(error);
      expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.INVALID_ARGS);
    });

    it('should handle unknown errors with UNKNOWN_ERROR exit code', () => {
      const error = { message: 'Something unexpected happened' };
      ErrorHandler.handle(error);
      expect(exitSpy).toHaveBeenCalledWith(EXIT_CODES.UNKNOWN_ERROR);
    });

    it('should output JSON when in JSON mode', () => {
      vi.mocked(Logger.isJsonMode).mockReturnValue(true);
      const error = { response: { statusCode: 404, body: null } };
      ErrorHandler.handle(error);
      expect(Logger.json).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: false,
          data: null,
          error: expect.objectContaining({
            code: ErrorCode.NOT_FOUND,
          }),
        }),
      );
    });
  });

  describe('success', () => {
    it('should output JSON success response in JSON mode', () => {
      vi.mocked(Logger.isJsonMode).mockReturnValue(true);
      ErrorHandler.success({ key: 'PROJ-123' });
      expect(Logger.json).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: true,
          data: { key: 'PROJ-123' },
          error: null,
        }),
      );
    });

    it('should not output anything when not in JSON mode', () => {
      vi.mocked(Logger.isJsonMode).mockReturnValue(false);
      ErrorHandler.success({ key: 'PROJ-123' });
      expect(Logger.json).not.toHaveBeenCalled();
    });
  });
});
