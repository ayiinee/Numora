import 'reflect-metadata';
import { parentPort } from 'node:worker_threads';
import { NestFactory } from '@nestjs/core';
import { closeDatabaseConnection } from '@tka/database';
import { AppModule } from '../app.module';
import { configureApplication } from '../bootstrap';
import { requireTeacherTokenPepper } from '../modules/schools/teacher-token';

async function start() {
  if (!parentPort) throw new Error('API worker requires its supervisor.');
  requireTeacherTokenPepper();
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  configureApplication(app);
  await app.listen(Number(process.env.API_PORT), '127.0.0.1');
  parentPort.postMessage({ ready: true });
  parentPort.on('message', (message: unknown) => {
    if (message === 'shutdown')
      void (async () => {
        await app.close();
        await closeDatabaseConnection();
        process.exit(0);
      })();
  });
}
void start();
