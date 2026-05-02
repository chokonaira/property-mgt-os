import { Module } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';
import { PropertiesController } from './properties.controller';
import { PropertiesService } from './properties.service';

const PROPERTIES_CONFIG = {
  uploadDir: process.env.UPLOAD_DIR ?? './uploads',
};

@Module({
  controllers: [PropertiesController],
  providers: [
    {
      provide: PropertiesService,
      useFactory: (prisma: PrismaService) => new PropertiesService(prisma, PROPERTIES_CONFIG),
      inject: [PrismaService],
    },
  ],
  exports: [PropertiesService],
})
export class PropertiesModule {}
