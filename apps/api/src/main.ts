import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApplication } from './bootstrap';
import { requireTeacherTokenPepper } from './modules/schools/teacher-token';
import { startApiTopology } from './runtime/api-topology';

async function bootstrap() {
  requireTeacherTokenPepper();
  const workers = Number(process.env.NUMORA_API_HTTP_WORKERS ?? 0);
  if (!Number.isSafeInteger(workers) || workers < 0)
    throw new Error('Invalid NUMORA_API_HTTP_WORKERS.');
  if (workers > 0) {
    const runtime = await startApiTopology(Number(process.env.API_PORT ?? 3001), workers, () =>
      process.exit(1),
    );
    console.info(JSON.stringify({ event: 'api-topology-ready', layout: runtime.layout }));
    for (const signal of ['SIGTERM', 'SIGINT'])
      process.on(signal, () => void runtime.close().then(() => process.exit(0)));
    return;
  }
  const app = await NestFactory.create(AppModule);
  configureApplication(app);

  const port = Number(process.env.API_PORT ?? 3001);
  // Let Node bind both IPv4 and IPv6 so either localhost address can reach the API.
  await app.listen(port);
}

void bootstrap();
