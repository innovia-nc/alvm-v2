/**
 * Worker de la file `alvm-email` — processus séparé de l'API, même image
 * (`node dist/worker.js`, `pnpm --filter @alvm/back dev:worker` en local).
 *
 * Démarrage fail-closed, comme l'API : configuration validée, rôle base
 * soumis à la RLS. Chaque job s'exécute dans le contexte RLS de son tenant
 * (`email.processor.ts`). Arrêt propre sur SIGTERM/SIGINT : les envois en
 * cours se terminent avant la fermeture des connexions.
 */
import { Worker } from 'bullmq';
import { loadEnv } from '@back/config/env';
import { assertRestrictedDatabaseRole } from '@back/db-context';
import { prisma } from '@back/db';
import {
  EMAIL_QUEUE_NAME,
  createRedisConnection,
  type EmailJobData,
} from '@back/queues/email.queue';
import { processEmailJob, type EmailJobResult } from '@back/queues/email.processor';

const LOG = '[alvm-worker]';

async function start() {
  const env = loadEnv();
  if (!env.REDIS_URL)
    throw new Error(`REDIS_URL est requis pour consommer la file ${EMAIL_QUEUE_NAME}.`);
  await assertRestrictedDatabaseRole();

  const connection = createRedisConnection(env.REDIS_URL, 'worker');
  const worker = new Worker<EmailJobData, EmailJobResult>(
    EMAIL_QUEUE_NAME,
    (job) => processEmailJob(job),
    {
      connection,
      concurrency: 2,
      // Limite par défaut du fournisseur (Resend) : 2 requêtes par seconde.
      limiter: { max: 2, duration: 1000 },
    },
  );

  // Journal sans donnée personnelle ni lien : identifiant du message et tenant.
  worker.on('completed', (job, result) => {
    console.log(`${LOG} ${job.name} ${job.id} (${job.data.organizationId}) : ${result.status}`);
  });
  worker.on('failed', (job, error) => {
    if (!job) return console.error(`${LOG} échec hors job : ${error.message}`);
    const attempts = job.opts.attempts ?? 1;
    const final = job.attemptsMade >= attempts || error.name === 'UnrecoverableError';
    console.error(
      `${LOG} ${job.name} ${job.id} (${job.data.organizationId}) : tentative ${job.attemptsMade}/${attempts} en échec${
        final ? ' — définitif' : ''
      } — ${error.message}`,
    );
  });
  // Sans écouteur, un 'error' (Redis tombé) ferait tomber le processus.
  worker.on('error', (error) => console.error(`${LOG} ${error.message}`));

  await worker.waitUntilReady();
  console.log(`${LOG} prêt — file ${EMAIL_QUEUE_NAME}`);

  let stopping = false;
  const stop = async (signal: NodeJS.Signals) => {
    if (stopping) return;
    stopping = true;
    console.log(`${LOG} ${signal} : fin des envois en cours puis arrêt`);
    try {
      await worker.close();
    } finally {
      connection.disconnect();
      await prisma.$disconnect().catch(() => undefined);
    }
    process.exit(0);
  };
  process.once('SIGTERM', () => void stop('SIGTERM'));
  process.once('SIGINT', () => void stop('SIGINT'));
}

start().catch(async (error) => {
  console.error(`${LOG} démarrage impossible — ${error instanceof Error ? error.message : error}`);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
