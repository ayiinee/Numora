import {
  Controller,
  Get,
  Header,
  Headers,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { createHash, timingSafeEqual } from 'node:crypto';
import { metricsEnabled } from '@tka/database';
import { MetricsService } from './metrics.service';
const digest = (value: string) => createHash('sha256').update(value).digest();

@ApiExcludeController()
@Controller('internal/metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async get(@Headers('authorization') authorization?: string) {
    const token = process.env.METRICS_TOKEN;
    if (!metricsEnabled() || !token || token.length < 32) throw new NotFoundException();
    if (!timingSafeEqual(digest(authorization ?? ''), digest(`Bearer ${token}`)))
      throw new UnauthorizedException();
    return this.metrics.text();
  }
}
