import { MaterialsService } from './materials.service';
import { PretestController } from './pretest.controller';
import { PretestService } from './pretest.service';
import { ConfigModule } from '@nestjs/config';
import { AssessmentMediaController } from './assessment-media.controller';
import { R2MediaStorage } from '../content/r2-media.storage';
import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { PvpModule } from '../pvp/pvp.module';
import { AssessmentHistoryService } from './assessment-history.service';
import { DrillAssessmentService } from './drill-assessment.service';
import { LearningController } from './learning.controller';
import { LearningCatalogService } from './learning-catalog.service';
import { TryoutReleaseService } from './tryout-release.service';
import { TryoutController } from './tryout.controller';
import { TryoutService } from './tryout.service';
import { StudentDashboardService } from './student-dashboard.service';

@Module({
  imports: [IdentityModule, PvpModule, ConfigModule],
  controllers: [LearningController, TryoutController, PretestController, AssessmentMediaController],
  providers: [
    MaterialsService,
    PretestService,
    R2MediaStorage,
    LearningCatalogService,
    DrillAssessmentService,
    AssessmentHistoryService,
    TryoutReleaseService,
    TryoutService,
    StudentDashboardService,
  ],
  exports: [LearningCatalogService, DrillAssessmentService, AssessmentHistoryService],
})
export class LearningModule {}
