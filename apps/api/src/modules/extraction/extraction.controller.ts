import { Body, Controller, HttpCode, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import {
  type ExtractionRunRequest,
  ExtractionRunRequestSchema,
  type ExtractionRunResponse,
} from '@buena/shared';
import { byIp, RateLimit } from '../../shared/rate-limit.decorator';
import { RateLimitGuard } from '../../shared/rate-limit.guard';
import { ZodValidationPipe } from '../../shared/zod-validation.pipe';
import { ExtractionError } from './extraction-error';
import { AppException } from '../../shared/exceptions';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- runtime value: Nest DI reads constructor param metadata
import { ExtractionService } from './extraction.service';

const RATE_LIMIT_PER_MIN = Number(process.env.RATE_LIMIT_EXTRACTION_PER_MIN ?? 5);

@Controller('extraction/runs')
@UseGuards(RateLimitGuard)
export class ExtractionController {
  constructor(private readonly extraction: ExtractionService) {}

  /**
   * Synchronous v1: caller blocks for the full pipeline (token guard
   * → OpenAI call → span verification → persist). Cached runs return
   * in <50 ms; live runs in 3–6 s for the sample document. The
   * rate limit applies per IP at 5 req/min so a runaway client
   * can't drain the OpenAI budget.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @RateLimit({ perMinute: RATE_LIMIT_PER_MIN, keyer: byIp, bucketName: 'extraction' })
  async run(
    @Body(new ZodValidationPipe(ExtractionRunRequestSchema)) body: ExtractionRunRequest,
    @Query('force') force?: string,
  ): Promise<ExtractionRunResponse> {
    try {
      return await this.extraction.run(body.documentId, {
        force: force === 'true',
      });
    } catch (error) {
      if (error instanceof ExtractionError) {
        throw mapExtractionError(error);
      }
      throw error;
    }
  }
}

function mapExtractionError(error: ExtractionError): AppException {
  switch (error.reason) {
    case 'document_missing':
      return new AppException('NOT_FOUND', error.message, HttpStatus.NOT_FOUND);
    case 'storage_missing':
      return new AppException('INTERNAL', error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    case 'cannot_read_pdf':
      return new AppException('VALIDATION_FAILED', error.message, HttpStatus.UNPROCESSABLE_ENTITY);
    case 'too_large':
      return new AppException('EXTRACTION_TOO_LARGE', error.message, HttpStatus.PAYLOAD_TOO_LARGE);
    case 'timeout':
      return new AppException('EXTRACTION_TIMEOUT', error.message, HttpStatus.GATEWAY_TIMEOUT);
    case 'parse_failed':
      return new AppException('EXTRACTION_PARSE_FAILED', error.message, HttpStatus.BAD_GATEWAY);
    default:
      return new AppException('INTERNAL', error.message, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
