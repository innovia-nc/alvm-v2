import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '@back/app.module';
import { loadEnv } from '@back/config/env';
import { assertRestrictedDatabaseRole } from '@back/db-context';
import { prisma } from '@back/db';

/**
 * Back ALVM (NestJS 11) — `alvm-back`.
 *
 * Démarrage fail-closed : configuration validée, rôle base soumis à la RLS.
 * bodyParser désactivé : les corps sont transmis en flux aux handlers Fetch
 * (tRPC, téléversements multipart).
 */
async function bootstrap() {
  const env = loadEnv();
  await assertRestrictedDatabaseRole();

  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  await app.listen(env.PORT, '0.0.0.0');
  console.log(`[alvm-back] prêt sur :${env.PORT}`);
}

bootstrap().catch(async (error) => {
  console.error(
    `[alvm-back] démarrage impossible — ${error instanceof Error ? error.message : error}`,
  );
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
