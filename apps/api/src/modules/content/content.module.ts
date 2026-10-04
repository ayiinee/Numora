import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IdentityModule } from '../identity/identity.module';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import { DrillPackagesController } from './drill-packages.controller';
import { DrillPackagesService } from './drill-packages.service';
import { MediaUploadsController } from './media-uploads.controller';
import { MediaUploadsService } from './media-uploads.service';
import { MediaUploadsRepository } from './media-uploads.repository';
import { R2MediaStorage } from './r2-media.storage';

@Module({
  imports: [IdentityModule, ConfigModule],
  controllers: [ContentController, DrillPackagesController, MediaUploadsController],
  providers: [
    ContentService,
    DrillPackagesService,
    MediaUploadsService,
    MediaUploadsRepository,
    R2MediaStorage,
  ],
  exports: [ContentService, DrillPackagesService],
})
export class ContentModule {}
