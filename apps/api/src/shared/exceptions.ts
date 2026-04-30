import { HttpException, HttpStatus } from '@nestjs/common';
import type { ZodIssue } from 'zod';
import type { ApiErrorEnvelope, ErrorCode } from '@buena/shared';

export type { ErrorCode };
export type ErrorBody = ApiErrorEnvelope;

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
