import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiErrorCode, type ApiErrorBody } from '@samona/types';

const STATUS_TO_CODE: Record<number, ApiErrorCode> = {
  [HttpStatus.BAD_REQUEST]: ApiErrorCode.BAD_REQUEST,
  [HttpStatus.UNAUTHORIZED]: ApiErrorCode.UNAUTHENTICATED,
  [HttpStatus.FORBIDDEN]: ApiErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ApiErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: ApiErrorCode.CONFLICT,
  [HttpStatus.UNPROCESSABLE_ENTITY]: ApiErrorCode.VALIDATION_FAILED,
  [HttpStatus.TOO_MANY_REQUESTS]: ApiErrorCode.RATE_LIMITED,
};

/**
 * Turns every thrown error into the one API error envelope.
 *
 * Two rules from CLAUDE.md "Error Handling" are enforced here:
 *  1. Nothing is swallowed — every failure is logged server-side.
 *  2. Nothing internal leaks — stack traces, driver errors and infrastructure
 *     detail never reach the client. Unexpected errors return a generic message
 *     plus a request id the operator can correlate with the log.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = request.header('x-request-id') ?? undefined;

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const code = STATUS_TO_CODE[status] ?? ApiErrorCode.INTERNAL;

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} failed (requestId=${requestId ?? 'none'})`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.url} -> ${status} (requestId=${requestId ?? 'none'})`,
      );
    }

    const body: ApiErrorBody = {
      error: {
        code,
        message: this.clientMessage(exception, status),
        details: this.fieldDetails(exception),
        requestId,
      },
    };

    response.status(status).json(body);
  }

  /** Client-safe message: pass through HTTP exceptions, mask everything else. */
  private clientMessage(exception: unknown, status: number): string {
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      return 'Something went wrong. Please try again.';
    }

    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      if (typeof payload === 'string') return payload;
      if (typeof payload === 'object' && payload !== null && 'message' in payload) {
        const { message } = payload as { message: unknown };
        if (typeof message === 'string') return message;
        if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
      }
      return exception.message;
    }

    return 'Request failed.';
  }

  /** Field-level messages attached by `ZodValidationPipe`, if any. */
  private fieldDetails(exception: unknown): Record<string, string[]> | undefined {
    if (!(exception instanceof HttpException)) return undefined;

    const payload = exception.getResponse();
    if (typeof payload !== 'object' || payload === null || !('details' in payload)) {
      return undefined;
    }

    const { details } = payload as { details: unknown };
    return typeof details === 'object' && details !== null
      ? (details as Record<string, string[]>)
      : undefined;
  }
}
