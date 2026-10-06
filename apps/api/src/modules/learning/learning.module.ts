import { MaterialsService } from './materials.service';
import { PretestController } from './pretest.controller';
import { PretestService } from './pretest.service';
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
  imports: [IdentityModule, PvpModule],
  controllers: [LearningController, TryoutController, PretestController],
  providers: [
    MaterialsService,
    PretestService,
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
