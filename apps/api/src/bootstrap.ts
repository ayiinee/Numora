import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createOpenApiDocument } from './openapi';
import { ProblemDetailsFilter } from './problem-details.filter';

export function configureApplication(app: INestApplication) {
  (app as NestExpressApplication).useBodyParser('json', { limit: '2mb' });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new ProblemDetailsFilter());

  const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    exposedHeaders: ['X-Numora-Admin-Role'],
  });

  const document = createOpenApiDocument(app);
  SwaggerModule.setup('api/docs', app, document);

  return document;
}
