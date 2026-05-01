import { Module } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import { pdfjsExtract, unpdfExtract } from './pdf-extractors';
import { PdfTextService } from './pdf-text.service';

const EXTRACTION_CONFIG = {
  uploadDir: process.env.UPLOAD_DIR ?? './uploads',
};

@Module({
  providers: [
    {
      provide: PdfTextService,
      useFactory: (prisma: PrismaService) =>
        new PdfTextService(prisma, EXTRACTION_CONFIG, {
          unpdfExtract,
          pdfjsExtract,
        }),
      inject: [PrismaService],
    },
  ],
  exports: [PdfTextService],
})
export class ExtractionModule {}
