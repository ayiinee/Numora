import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module';
import { IdentityModule } from '../identity/identity.module';
import { LearningModule } from '../learning/learning.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { StudentSupportController } from './student-support.controller';
import { StudentSupportService } from './student-support.service';
@Module({
  imports: [IdentityModule, LearningModule, ContentModule],
  controllers: [ReportsController, StudentSupportController],
  providers: [ReportsService, StudentSupportService],
})
export class ReportsModule {}
