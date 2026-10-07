import { PretestController } from './pretest.controller';
import { PretestService } from './pretest.service';
import { Module } from '@nestjs/common';
import { AssessmentPoliciesService } from './assessment-policies.service';
import { AssessmentReadinessService } from './assessment-readiness.service';
import { ContentLifecycleController } from './content-lifecycle.controller';
import { ContentLifecycleService } from './content-lifecycle.service';
import { GeneratorController } from './generator.controller';
import { GeneratorService } from './generator.service';
import { GeneratorPackagesService } from './generator-packages.service';
import { GeneratorPackagesController } from './generator-packages.controller';
import { ContentPreviewController } from './content-preview.controller';
import { ContentPreviewService } from './content-preview.service';
import { ContentImportService } from './content-import.service';
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
import { ExcelImportController } from './excel-import.controller';
import { ExcelImportService } from './excel-import.service';
import { ContentPackagesController } from './content-packages.controller';
import { ContentPackagesService } from './content-packages.service';
import { ContentUploadsController, TrackedExcelInterceptor } from './content-uploads.controller';
import { ContentUploadsService } from './content-uploads.service';

@Module({
  imports: [IdentityModule, ConfigModule],
  controllers: [
    PretestController,
    ContentLifecycleController,
    GeneratorController,
    GeneratorPackagesController,
    ContentController,
    DrillPackagesController,
    MediaUploadsController,
    ContentPreviewController,
    ExcelImportController,
    ContentPackagesController,
    ContentUploadsController,
  ],
  providers: [
    PretestService,
    AssessmentPoliciesService,
    AssessmentReadinessService,
    ContentLifecycleService,
    GeneratorService,
    GeneratorPackagesService,
    ContentImportService,
    ContentUploadsService,
    TrackedExcelInterceptor,
    ExcelImportService,
    ContentPackagesService,
    ContentPreviewService,
    ContentService,
    DrillPackagesService,
    MediaUploadsService,
    MediaUploadsRepository,
    R2MediaStorage,
  ],
  exports: [ContentService, DrillPackagesService, ContentLifecycleService, R2MediaStorage],
})
export class ContentModule {}
