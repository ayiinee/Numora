import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { MetricsController } from '../observability/metrics.controller';
import { MetricsService } from '../observability/metrics.service';

@Module({
  controllers: [HealthController, MetricsController],
  providers: [HealthService, MetricsService],
})
export class HealthModule {}
