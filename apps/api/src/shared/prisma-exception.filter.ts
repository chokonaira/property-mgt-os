import { Catch, HttpStatus, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import type { ApiErrorEnvelope, ErrorCode } from '@buena/shared';

interface MappedError {
  status: HttpStatus;
  code: ErrorCode;
  message: string;
}

function map(error: Prisma.PrismaClientKnownRequestError): MappedError | null {
  switch (error.code) {
    case 'P2002': {
      const target = (error.meta as { target?: string[] | string } | undefined)?.target;
      const fields = Array.isArray(target) ? target.join(', ') : (target ?? 'value');
      return {
        status: HttpStatus.CONFLICT,
        code: 'CONFLICT',
        message: `Duplicate value for unique field(s): ${fields}.`,
      };
    }
    case 'P2025':
      return {
        status: HttpStatus.NOT_FOUND,
        code: 'NOT_FOUND',
        message: 'The requested record was not found.',
      };
    default:
      return null;
  }
}

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const requestId = (req.headers['x-request-id'] as string | undefined) ?? undefined;

    const mapped = map(exception);
    if (!mapped) {
      // Unhandled Prisma code — let GlobalErrorFilter produce the INTERNAL envelope.
      throw exception;
    }

    const body: ApiErrorEnvelope = {
      error: { code: mapped.code, message: mapped.message, requestId },
    };

    res.status(mapped.status).json(body);
  }
}
