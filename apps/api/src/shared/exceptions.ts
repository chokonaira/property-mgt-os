import { HttpException, HttpStatus } from '@nestjs/common';
import type { ZodIssue } from 'zod';

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'EXTRACTION_TIMEOUT'
  | 'EXTRACTION_PARSE_FAILED'
  | 'EXTRACTION_TOO_LARGE'
  | 'INTERNAL';

export interface ErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

export class AppException extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    status: HttpStatus,
    public readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }
}

export class ValidationException extends AppException {
  constructor(issues: ZodIssue[]) {
    super(
      'VALIDATION_FAILED',
      'Request payload failed validation.',
      HttpStatus.UNPROCESSABLE_ENTITY,
      issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      })),
    );
  }
}
