import { Module } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

const DOCUMENTS_CONFIG = {
  uploadDir: process.env.UPLOAD_DIR ?? './uploads',
  maxBytes: Number(process.env.UPLOAD_MAX_BYTES ?? 10_485_760),
};

@Module({
  controllers: [DocumentsController],
  providers: [
    {
      provide: DocumentsService,
      useFactory: (prisma: PrismaService) => new DocumentsService(prisma, DOCUMENTS_CONFIG),
      inject: [PrismaService],
    },
  ],
})
export class DocumentsModule {}
