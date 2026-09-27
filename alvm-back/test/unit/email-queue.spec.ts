vi.mock('bullmq', async (importOriginal) => ({
  ...(await importOriginal<typeof import('bullmq')>()),
  Queue: (await import('../helpers/fake-email-queue')).FakeQueue,
}));

/**
 * Producteur de la file `alvm-email` (CLAUDE.md InnovIA §5.11) : ligne
 * `email_messages` créée dans la transaction du tenant PUIS job ajouté, avec
 * les options de fiabilité (3 tentatives, backoff exponentiel, rétention bornée).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TRPCError } from '@trpc/server';
import {
  EMAIL_QUEUE_NAME,
  enqueueEmail,
  isEmailQueueConfigured,
  closeEmailQueue,
} from '@back/queues/email.queue';
import { queueAdd, createdQueues, resetFakeEmailQueue } from '../helpers/fake-email-queue';
import { createMockPrisma, type MockPrisma } from '../helpers/mock-prisma';

const ORG_ID = 'b0000000-0000-4000-b000-000000000001';
const MESSAGE_ID = 'e0000000-0000-4000-a000-000000000001';
const INVOICE_ID = 'a0000000-0000-1000-a000-000000000001';

describe('email.queue — producteur alvm-email', () => {
  let db: MockPrisma;

  beforeEach(async () => {
    await resetFakeEmailQueue();
    vi.stubEnv('REDIS_URL', 'redis://localhost:6380');
    db = createMockPrisma();
    db.emailMessage.create.mockResolvedValue({ id: MESSAGE_ID });
  });

  afterEach(async () => {
    await closeEmailQueue();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('nomme la file selon la convention {projet}-{type}, sans « : » (refusé par BullMQ 5)', () => {
    expect(EMAIL_QUEUE_NAME).toBe('alvm-email');
    expect(EMAIL_QUEUE_NAME).not.toContain(':');
  });

  it('échoue explicitement en PRECONDITION_FAILED sans REDIS_URL, avant toute écriture', async () => {
    vi.stubEnv('REDIS_URL', '');
    expect(isEmailQueueConfigured()).toBe(false);

    await expect(
      enqueueEmail(db, {
        organizationId: ORG_ID,
        kind: 'invoice',
        recipient: 'jean@example.nc',
        subject: 'Votre facture',
        relatedId: INVOICE_ID,
      }),
    ).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: expect.stringContaining('REDIS_URL'),
    });
    expect(db.emailMessage.create).not.toHaveBeenCalled();
    expect(queueAdd).not.toHaveBeenCalled();
  });

  it('crée la ligne QUEUED dans la transaction puis ajoute le job avec les options de fiabilité', async () => {
    const result = await enqueueEmail(db, {
      organizationId: ORG_ID,
      kind: 'invoice',
      recipient: 'jean@example.nc',
      subject: 'Votre facture FAC-2026-0001 — ALVM',
      relatedId: INVOICE_ID,
      createdBy: 'a0000000-0000-4000-a000-000000000001',
    });

    expect(result).toEqual({ emailMessageId: MESSAGE_ID });
    expect(db.emailMessage.create).toHaveBeenCalledWith({
      data: {
        organizationId: ORG_ID,
        kind: 'invoice',
        recipient: 'jean@example.nc',
        subject: 'Votre facture FAC-2026-0001 — ALVM',
        relatedId: INVOICE_ID,
        createdBy: 'a0000000-0000-4000-a000-000000000001',
      },
      select: { id: true },
    });
    // La ligne d'abord : le job ne référence jamais un message inexistant.
    expect(db.emailMessage.create.mock.invocationCallOrder[0]).toBeLessThan(
      queueAdd.mock.invocationCallOrder[0]!,
    );

    expect(createdQueues).toHaveLength(1);
    expect(createdQueues[0]!.name).toBe('alvm-email');
    // Un 'error' sans écouteur ferait tomber l'API.
    expect(createdQueues[0]!.on).toHaveBeenCalledWith('error', expect.any(Function));

    const [name, data, opts] = queueAdd.mock.calls[0]!;
    expect(name).toBe('invoice');
    // Payload minimal : ni destinataire, ni document (le worker relit la ligne).
    expect(data).toEqual({ organizationId: ORG_ID, emailMessageId: MESSAGE_ID, kind: 'invoice' });
    expect(opts).toEqual({
      jobId: MESSAGE_ID,
      attempts: 3,
      backoff: { type: 'exponential', delay: 15_000 },
      delay: 1_000,
      removeOnComplete: true,
      removeOnFail: { age: 7 * 24 * 3600, count: 500 },
    });
  });

  it('transporte le lien de réinitialisation dans le job seulement, et ne garde pas un job en échec', async () => {
    const expiresAt = new Date('2026-09-27T10:30:00.000Z');
    await enqueueEmail(db, {
      organizationId: ORG_ID,
      kind: 'password-reset',
      recipient: 'jean@example.nc',
      subject: 'Réinitialiser votre mot de passe Plateforme',
      resetUrl: 'https://app.example.nc/auth/reset-password?token=abc',
      expiresAt,
    });

    // Le lien (jeton en clair) n'est jamais écrit en base.
    expect(JSON.stringify(db.emailMessage.create.mock.calls[0]![0])).not.toContain('token=abc');
    const [name, data, opts] = queueAdd.mock.calls[0]!;
    expect(name).toBe('password-reset');
    expect(data).toEqual({
      organizationId: ORG_ID,
      emailMessageId: MESSAGE_ID,
      kind: 'password-reset',
      resetUrl: 'https://app.example.nc/auth/reset-password?token=abc',
      expiresAt: '2026-09-27T10:30:00.000Z',
    });
    expect(opts).toMatchObject({ attempts: 3, removeOnComplete: true, removeOnFail: true });
  });

  it('réutilise une seule connexion de producteur', async () => {
    const input = {
      organizationId: ORG_ID,
      kind: 'invoice' as const,
      recipient: 'jean@example.nc',
      subject: 'Votre facture',
    };
    await enqueueEmail(db, input);
    await enqueueEmail(db, input);
    expect(createdQueues).toHaveLength(1);
    expect(queueAdd).toHaveBeenCalledTimes(2);
  });

  it('traduit un Redis injoignable en SERVICE_UNAVAILABLE (la transaction est annulée)', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    queueAdd.mockRejectedValue(new Error("Stream isn't writeable"));

    const failure = await enqueueEmail(db, {
      organizationId: ORG_ID,
      kind: 'invoice',
      recipient: 'jean@example.nc',
      subject: 'Votre facture',
    }).catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(TRPCError);
    expect(failure).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(error).toHaveBeenCalled();
    // La file en échec est refermée : la programmation suivante repart d'une connexion neuve.
    expect(createdQueues[0]!.close).toHaveBeenCalled();
    queueAdd.mockResolvedValue({ id: MESSAGE_ID });
    await enqueueEmail(db, {
      organizationId: ORG_ID,
      kind: 'invoice',
      recipient: 'jean@example.nc',
      subject: 'Votre facture',
    });
    expect(createdQueues).toHaveLength(2);
    error.mockRestore();
  });

  it("n'attend pas indéfiniment un Redis qui ne répond pas", async () => {
    vi.useFakeTimers();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    queueAdd.mockReturnValue(new Promise(() => undefined));

    const pending = enqueueEmail(db, {
      organizationId: ORG_ID,
      kind: 'invoice',
      recipient: 'jean@example.nc',
      subject: 'Votre facture',
    });
    const assertion = expect(pending).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;
    error.mockRestore();
  });
});
