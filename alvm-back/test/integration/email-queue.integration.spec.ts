vi.mock('@back/db', () => ({
  prisma: { platformIntegration: { findUnique: vi.fn().mockResolvedValue(null) } },
}));

/**
 * File `alvm-email` contre un VRAI Redis (docker compose : redis://127.0.0.1:6380).
 *
 * Hors suite unitaire : `pnpm --filter @alvm/back test:integration:email-queue`.
 * Redis absent = ÉCHEC du run, jamais un saut silencieux (CLAUDE.md InnovIA §6.5).
 *
 * Vérifie ce que les mocks ne voient pas : options de job acceptées par BullMQ,
 * connexion paresseuse du producteur, et sémantique réelle des tentatives
 * (`attemptsMade`) sur laquelle le processeur décide FAILED.
 * La base est simulée (ligne `email_messages` en mémoire) : le contexte RLS
 * réel est couvert par la vérification locale du worker (docs/file-emails.md).
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import IORedis from 'ioredis';
import { Queue, QueueEvents, Worker, type Job } from 'bullmq';
import {
  EMAIL_QUEUE_NAME,
  closeEmailQueue,
  emailJobOptions,
  enqueueEmail,
  type EmailJobData,
} from '@back/queues/email.queue';
import { processEmailJob, type EmailProcessorDeps } from '@back/queues/email.processor';
import type { DbContext } from '@back/db-context';
import { createMockPrisma } from '../helpers/mock-prisma';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6380';
const ORG_ID = 'b0000000-0000-4000-b000-000000000001';
/** Préfixe propre au run : n'interfère avec aucun worker de dev. */
const PREFIX = `alvm-test-${randomUUID().slice(0, 8)}`;

let connection: IORedis;

beforeAll(async () => {
  connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
  await connection.connect().catch((error: unknown) => {
    throw new Error(
      `Redis injoignable sur ${REDIS_URL} (docker compose up -d redis) : ${
        error instanceof Error ? error.message : error
      }`,
    );
  });
  expect(await connection.ping()).toBe('PONG');
});

afterAll(async () => {
  await closeEmailQueue();
  if (connection.status === 'ready') {
    const keys = await connection.keys(`${PREFIX}:*`);
    if (keys.length) await connection.del(...keys);
  }
  connection.disconnect();
});

describe('producteur alvm-email (Redis réel)', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('programme un job accepté par BullMQ avec les options attendues', async () => {
    vi.stubEnv('REDIS_URL', REDIS_URL);
    const messageId = randomUUID();
    const db = createMockPrisma();
    db.emailMessage.create.mockResolvedValue({ id: messageId });

    await enqueueEmail(db, {
      organizationId: ORG_ID,
      kind: 'invoice',
      recipient: 'jean@example.nc',
      subject: 'Votre facture',
      relatedId: randomUUID(),
    });

    // File réelle `alvm-email` (préfixe BullMQ par défaut) : le job est différé
    // d'1 s, on le lit et on le retire avant qu'un worker de dev ne le prenne.
    const queue = new Queue(EMAIL_QUEUE_NAME, { connection });
    try {
      const job = await queue.getJob(messageId);
      expect(job).toBeDefined();
      expect(job!.name).toBe('invoice');
      expect(job!.data).toEqual({
        organizationId: ORG_ID,
        emailMessageId: messageId,
        kind: 'invoice',
      });
      expect(job!.opts).toMatchObject({
        attempts: 3,
        backoff: { type: 'exponential', delay: 15_000 },
        delay: 1_000,
      });
      await job!.remove();
    } finally {
      await queue.close();
    }
  });
});

describe('worker alvm-email (Redis réel, base simulée)', () => {
  let queue: Queue<EmailJobData>;
  let events: QueueEvents;
  let worker: Worker<EmailJobData> | undefined;

  beforeAll(async () => {
    queue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, { connection, prefix: PREFIX });
    events = new QueueEvents(EMAIL_QUEUE_NAME, {
      connection: connection.duplicate(),
      prefix: PREFIX,
    });
    await events.waitUntilReady();
  });

  afterEach(async () => {
    await worker?.close();
    worker = undefined;
  });

  afterAll(async () => {
    await events.close();
    await queue.close();
  });

  /** Base simulée : une ligne `email_messages` QUEUED + réglages d'expédition. */
  function arrange(send: EmailProcessorDeps['sendEmail']) {
    const db = createMockPrisma();
    const contexts: DbContext[] = [];
    const row = {
      id: randomUUID(),
      kind: 'password-reset',
      recipient: 'jean@example.nc',
      subject: 'Réinitialiser votre mot de passe',
      relatedId: null,
      status: 'QUEUED' as string,
      attempts: 0,
      lastError: null as string | null,
    };
    db.emailMessage.findFirst.mockImplementation(async () => ({ ...row }));
    db.emailMessage.update.mockImplementation(async ({ data }: any) => {
      if (data.status) row.status = data.status;
      if (data.attempts?.increment) row.attempts += data.attempts.increment;
      if ('lastError' in data) row.lastError = data.lastError;
      return { id: row.id };
    });
    db.appSetting.findMany.mockResolvedValue([
      { key: 'from_email', value: '"noreply@example.nc"' },
    ]);
    db.organization.findFirst.mockResolvedValue({ name: 'Association test' });
    const deps: EmailProcessorDeps = {
      withDb: (async (context: DbContext, fn: (tx: any) => Promise<unknown>) => {
        contexts.push(context);
        return fn(db);
      }) as EmailProcessorDeps['withDb'],
      sendEmail: send,
      renderInvoicePdf: vi.fn(),
      now: () => new Date(),
    };
    worker = new Worker<EmailJobData>(EMAIL_QUEUE_NAME, (job) => processEmailJob(job, deps), {
      connection: connection.duplicate(),
      prefix: PREFIX,
    });
    return { row, contexts };
  }

  async function add(row: { id: string }, expiresAt = new Date(Date.now() + 60_000)) {
    const job = await queue.add(
      'password-reset',
      {
        kind: 'password-reset',
        organizationId: ORG_ID,
        emailMessageId: row.id,
        resetUrl: 'https://app.example.nc/auth/reset-password?token=abc',
        expiresAt: expiresAt.toISOString(),
      },
      // Options de production, délais raccourcis pour le test.
      {
        ...emailJobOptions('password-reset', row.id),
        backoff: { type: 'exponential', delay: 50 },
        delay: 0,
      },
    );
    return job as Job<EmailJobData>;
  }

  it('marque SENT au premier essai, dans le tenant du job', async () => {
    const send = vi.fn().mockResolvedValue({ id: 're_ok' });
    const { row, contexts } = arrange(send);

    const job = await add(row);
    await job.waitUntilFinished(events, 10_000);

    expect(row.status).toBe('SENT');
    expect(row.attempts).toBe(1);
    expect(send).toHaveBeenCalledOnce();
    expect(contexts.every((c) => c.scope === 'tenant' && c.organizationId === ORG_ID)).toBe(true);
  });

  it('réessaie 3 fois puis marque FAILED à la dernière tentative réelle', async () => {
    const send = vi.fn().mockRejectedValue(new Error('HTTP 503'));
    const { row } = arrange(send);

    const job = await add(row);
    await expect(job.waitUntilFinished(events, 10_000)).rejects.toThrow('HTTP 503');

    expect(send).toHaveBeenCalledTimes(3);
    expect(row.attempts).toBe(3);
    expect(row.status).toBe('FAILED');
    expect(row.lastError).toBe('HTTP 503');
    // Job d'une réinitialisation (lien secret) : pas conservé dans Redis.
    expect(await queue.getJob(row.id)).toBeUndefined();
  });

  it("n'effectue qu'une tentative sur erreur définitive (lien expiré)", async () => {
    const send = vi.fn();
    const { row } = arrange(send);

    const job = await add(row, new Date(Date.now() - 1_000));
    await expect(job.waitUntilFinished(events, 10_000)).rejects.toThrow(/expiré/);

    expect(send).not.toHaveBeenCalled();
    expect(row.attempts).toBe(1);
    expect(row.status).toBe('FAILED');
  });
});
