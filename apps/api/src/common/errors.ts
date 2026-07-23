import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiErrorBody, ERROR_CODES, ErrorCode } from '@hospital-ai/shared-types';

/**
 * Domain error carrying a machine-readable code. Serialised to the canonical
 * HTTP body { code, message, details }. A patient client never renders `message`;
 * it maps `code` to a content string.
 */
export class AppError extends Error {
  readonly code: ErrorCode | string;
  readonly details?: Record<string, unknown>;
  readonly httpStatus: number;

  constructor(
    code: ErrorCode | string,
    message?: string,
    details?: Record<string, unknown>,
    httpStatus?: number,
  ) {
    super(message ?? code);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
    this.httpStatus = httpStatus ?? httpStatusForCode(code);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/** Default HTTP status per error code. */
export function httpStatusForCode(code: ErrorCode | string): number {
  switch (code) {
    case ERROR_CODES.VALIDATION_ERROR:
      return HttpStatus.BAD_REQUEST;
    case ERROR_CODES.UNAUTHORIZED:
      return HttpStatus.UNAUTHORIZED;
    case ERROR_CODES.WRONG_TOKEN_AUDIENCE:
    case ERROR_CODES.CROSS_CLINIC_FORBIDDEN:
    case ERROR_CODES.FORBIDDEN:
    case ERROR_CODES.CLINICAL_CONTENT_NOT_APPROVED:
    case ERROR_CODES.CONTENT_NOT_APPROVED:
    case ERROR_CODES.APPEND_ONLY_VIOLATION:
    case ERROR_CODES.CONTENT_IMMUTABLE:
    case ERROR_CODES.INVALID_STATUS_TRANSITION:
      return HttpStatus.FORBIDDEN;
    case ERROR_CODES.NOT_FOUND:
      return HttpStatus.NOT_FOUND;
    case ERROR_CODES.DUPLICATE_REQUEST:
      return HttpStatus.CONFLICT;
    case ERROR_CODES.INTERNAL_ERROR:
      return HttpStatus.INTERNAL_SERVER_ERROR;
    default:
      return HttpStatus.INTERNAL_SERVER_ERROR;
  }
}

/** Global filter shaping every error into { code, message, details }. */
@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AppExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const body = this.toBody(exception);
    const status = this.statusFor(exception, body);

    if (status >= 500) {
      this.logger.error(
        `${req?.method} ${req?.url} -> ${status} ${body.code}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    res.status(status).json(body);
  }

  private statusFor(exception: unknown, body: ApiErrorBody): number {
    if (exception instanceof AppError) return exception.httpStatus;
    if (exception instanceof HttpException) return exception.getStatus();
    return httpStatusForCode(body.code);
  }

  private toBody(exception: unknown): ApiErrorBody {
    if (exception instanceof AppError) {
      return { code: exception.code, message: exception.message, details: exception.details };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      // class-validator via ValidationPipe -> BadRequestException with `message: string[]`.
      if (status === HttpStatus.BAD_REQUEST && isValidationResponse(response)) {
        const messages = normaliseMessages(response.message);
        return {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'Request validation failed.',
          details: { errors: messages },
        };
      }
      return {
        code: mapHttpStatusToCode(status),
        message: extractMessage(response) ?? exception.message,
      };
    }

    return {
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Internal server error.',
    };
  }
}

function mapHttpStatusToCode(status: number): string {
  switch (status) {
    case HttpStatus.UNAUTHORIZED:
      return ERROR_CODES.UNAUTHORIZED;
    case HttpStatus.FORBIDDEN:
      return ERROR_CODES.FORBIDDEN;
    case HttpStatus.NOT_FOUND:
      return ERROR_CODES.NOT_FOUND;
    case HttpStatus.CONFLICT:
      return ERROR_CODES.DUPLICATE_REQUEST;
    case HttpStatus.BAD_REQUEST:
      return ERROR_CODES.VALIDATION_ERROR;
    default:
      return ERROR_CODES.INTERNAL_ERROR;
  }
}

function isValidationResponse(
  response: unknown,
): response is { message: string | string[] } {
  return (
    typeof response === 'object' &&
    response !== null &&
    'message' in response &&
    (Array.isArray((response as { message: unknown }).message) ||
      typeof (response as { message: unknown }).message === 'string')
  );
}

function normaliseMessages(message: string | string[]): string[] {
  return Array.isArray(message) ? message : [message];
}

function extractMessage(response: unknown): string | undefined {
  if (typeof response === 'string') return response;
  if (
    typeof response === 'object' &&
    response !== null &&
    'message' in response &&
    typeof (response as { message: unknown }).message === 'string'
  ) {
    return (response as { message: string }).message;
  }
  return undefined;
}
