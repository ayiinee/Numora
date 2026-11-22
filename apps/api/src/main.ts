import 'reflect-metadata';
import { requireTeacherTokenPepper } from './modules/schools/teacher-token';
import {
  closeDatabaseConnection,
  getDatabase,
  productionTarget,
  ProductionPreflightError,
  startupFailureMessage,
  verifyProductionDatabase,
} from '@tka/database';

async function bootstrap() {
  const target = productionTarget('api');
  // Preserve Development's existing ConfigModule .env loading before checking its pepper.
  const developmentModule = target ? undefined : await import('./app.module');
  if (!target && (process.env.NODE_ENV === 'production' || process.env.NUMORA_DEPLOYMENT_PROFILE))
    throw new ProductionPreflightError([
      'Production configuration must be injected before Node starts; do not load it through Development dotenv fallback',
    ]);
  requireTeacherTokenPepper();
  if (target) await verifyProductionDatabase(getDatabase().client, target);
  // Load application modules only after the Production boundary is verified.
  const [{ NestFactory }, { AppModule }, { configureApplication }] = await Promise.all([
    import('@nestjs/core'),
    developmentModule ?? import('./app.module'),
    import('./bootstrap'),
  ]);
  const app = await NestFactory.create(AppModule);
  configureApplication(app);

  const port = Number(process.env.API_PORT ?? 3001);
  // Let Node bind both IPv4 and IPv6 so either localhost address can reach the API.
  await app.listen(port);
}

void bootstrap().catch(async (error: unknown) => {
  console.error(startupFailureMessage(error));
  // A failed startup must not leave initialized gateway/queue timers running.
  const deadline = setTimeout(() => process.exit(1), 5000);
  try {
    await closeDatabaseConnection();
  } finally {
    clearTimeout(deadline);
    process.exit(1);
  }
});
