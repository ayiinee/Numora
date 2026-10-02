import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { IdentityModule } from './modules/identity/identity.module';
import { ClassesModule } from './modules/classes/classes.module';
import { LearningModule } from './modules/learning/learning.module';
import { MonitoringModule } from './modules/monitoring/monitoring.module';
import { SchoolsModule } from './modules/schools/schools.module';
import { ContentModule } from './modules/content/content.module';
import { AdminModule } from './modules/admin/admin.module';
import { ReportsModule } from './modules/reports/reports.module';
import { IrtModule } from './modules/irt/irt.module';
import { PvpModule } from './modules/pvp/pvp.module';
import { LeaderboardsModule } from './modules/leaderboards/leaderboards.module';
import { FeedbackModule } from './modules/feedback/feedback.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env', '../../.env.local', '../../.env'],
    }),
    HealthModule,
    IdentityModule,
    ClassesModule,
    LearningModule,
    MonitoringModule,
    SchoolsModule,
    ContentModule,
    AdminModule,
    ReportsModule,
    IrtModule,
    PvpModule,
    LeaderboardsModule,
    FeedbackModule,
  ],
})
export class AppModule {}
