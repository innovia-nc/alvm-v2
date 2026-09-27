import { vi } from 'vitest';

/**
 * File BullMQ simulée pour les tests unitaires : aucun Redis, les jobs
 * ajoutés sont capturés par `queueAdd`. À brancher en tête de spec :
 *
 *   vi.mock('bullmq', async (importOriginal) => ({
 *     ...(await importOriginal<typeof import('bullmq')>()),
 *     Queue: (await import('../helpers/fake-email-queue')).FakeQueue,
 *   }));
 *
 * et, entre deux tests, `await resetFakeEmailQueue()` (referme le singleton du
 * producteur et remet les simulations à zéro).
 */
export const queueAdd = vi.fn();
export const createdQueues: FakeQueue[] = [];

export class FakeQueue {
  add = queueAdd;
  on = vi.fn();
  close = vi.fn().mockResolvedValue(undefined);

  constructor(
    readonly name: string,
    readonly opts: unknown,
  ) {
    createdQueues.push(this);
  }
}

export async function resetFakeEmailQueue() {
  const { closeEmailQueue } = await import('@back/queues/email.queue');
  await closeEmailQueue();
  createdQueues.length = 0;
  queueAdd.mockReset();
  queueAdd.mockImplementation(async (name: string, data: unknown, opts: { jobId?: string }) => ({
    id: opts?.jobId,
    name,
    data,
  }));
}
