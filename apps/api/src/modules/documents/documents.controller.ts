import {
  Controller,
  HttpCode,
  HttpStatus,
  ParseFilePipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { DocumentUploadResponse } from '@buena/shared';
import { byIp, RateLimit } from '../../shared/rate-limit.decorator';
import { RateLimitGuard } from '../../shared/rate-limit.guard';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- runtime value: Nest DI reads constructor param metadata
import { DocumentsService, type UploadedFile as InboundFile } from './documents.service';

const TENANT_ID = process.env.TENANT_DEFAULT_ID ?? 'demo';
const MAX_BYTES = Number(process.env.UPLOAD_MAX_BYTES ?? 10_485_760);
const UPLOAD_RATE_LIMIT_PER_MIN = Number(process.env.RATE_LIMIT_UPLOAD_PER_MIN ?? 10);

@Controller('documents')
@UseGuards(RateLimitGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ perMinute: UPLOAD_RATE_LIMIT_PER_MIN, keyer: byIp, bucketName: 'documents' })
  // memoryStorage keeps the buffer in RAM so the service can sniff
  // magic bytes BEFORE writing to disk; multer's limits.fileSize
  // enforces the hard cap at the parser layer (defence in depth).
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_BYTES, files: 1 },
    }),
  )
  upload(
    @UploadedFile(new ParseFilePipe({ fileIsRequired: true })) file: InboundFile,
  ): Promise<DocumentUploadResponse> {
    return this.documents.upload(TENANT_ID, file);
  }
}
