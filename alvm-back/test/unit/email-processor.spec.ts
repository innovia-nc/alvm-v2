vi.mock('@back/db', () => ({
  prisma: { platformIntegration: { findUnique: vi.fn().mockResolvedValue(null) } },
}));

/**
 * Worker de la file `alvm-email` : traitement d'un job (CLAUDE.md InnovIA §5.11).
 *
 * Dépendances injectées : transaction de contexte (tenant capturé), envoi au
 * fournisseur et rendu PDF simulés. Couvre SENT, tentative échouée,
 * dernière tentative → FAILED, erreurs définitives et exécution dans le tenant
 * du job.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnrecoverableError } from 'bullmq';
import { TRPCError } from '@trpc/server';
import {
  processEmailJob,
  type EmailJob,
  type EmailProcessorDeps,
} from '@back/queues/email.processor';
import type { DbContext } from '@back/db-context';
import { createMockPrisma, type MockPrisma } from '../helpers/mock-prisma';

const ORG_ID = 'b0000000-0000-4000-b000-000000000001';
const MESSAGE_ID = 'e0000000-0000-4000-a000-000000000001';
const INVOICE_ID = 'a0000000-0000-1000-a000-000000000001';
const NOW = new Date('2026-09-27T10:00:00.000Z');

function invoiceJob(attemptsMade = 0): EmailJob {
  return {
    id: MESSAGE_ID,
    data: { kind: 'invoice', organizationId: ORG_ID, emailMessageId: MESSAGE_ID },
    attemptsMade,
    opts: { attempts: 3 },
  };
}

function resetJob(expiresAt = '2026-09-27T10:30:00.000Z'): EmailJob {
  return {
    id: MESSAGE_ID,
    data: {
      kind: 'password-reset',
      organizationId: ORG_ID,
      emailMessageId: MESSAGE_ID,
      resetUrl: 'https://app.example.nc/auth/reset-password?token=abc&x=1',
      expiresAt,
    },
    attemptsMade: 0,
    opts: { attempts: 3 },
  };
}

describe('email.processor — traitement des jobs alvm-email', () => {
  let db: MockPrisma;
  let contexts: DbContext[];
  let deps: EmailProcessorDeps & {
    sendEmail: ReturnType<typeof vi.fn>;
    renderInvoicePdf: ReturnType<typeof vi.fn>;
  };

  function queuedMessage(overrides: Record<string, unknown> = {}) {
    return {
      id: MESSAGE_ID,
      kind: 'invoice',
      recipient: 'jean.dupont@example.nc',
      subject: 'Votre facture FAC-2026-0001 — ALVM',
      relatedId: INVOICE_ID,
      status: 'QUEUED',
      ...overrides,
    };
  }

  /** Dernière mise à jour de la ligne `email_messages`. */
  function lastUpdate() {
    return db.emailMessage.update.mock.calls.at(-1)![0];
  }

  beforeEach(() => {
    db = createMockPrisma();
    contexts = [];
    db.emailMessage.findFirst.mockResolvedValue(queuedMessage());
    db.emailMessage.update.mockResolvedValue({ id: MESSAGE_ID });
    db.appSetting.findMany.mockResolvedValue([
      { category: 'organization', key: 'short_name', value: '"ALVM"' },
      { category: 'email', key: 'from_name', value: '"ALVM"' },
      { category: 'email', key: 'from_email', value: '"noreply@alvm.nc"' },
    ]);
    deps = {
      withDb: (async (context: DbContext, fn: (tx: any) => Promise<unknown>) => {
        contexts.push(context);
        return fn(db);
      }) as EmailProcessorDeps['withDb'],
      sendEmail: vi.fn().mockResolvedValue({ id: 're_123' }),
      renderInvoicePdf: vi.fn().mockResolvedValue({
        invoice: {
          invoiceNumber: 'FAC-2026-0001',
          status: 'SENT',
          totalAmount: 10000,
          dueDate: new Date('2026-10-27T00:00:00.000Z'),
          parent: { firstName: 'Jean', lastName: 'Dupont' },
        },
        pdfBuffer: Buffer.from('%PDF-facture'),
      }),
      now: () => NOW,
    };
  });

  it('envoie la facture, PDF régénéré en pièce jointe, et marque la ligne SENT', async () => {
    const result = await processEmailJob(invoiceJob(), deps);

    expect(result).toEqual({ status: 'SENT', providerMessageId: 're_123' });
    expect(deps.renderInvoicePdf).toHaveBeenCalledWith(db, INVOICE_ID);
    expect(deps.sendEmail).toHaveBeenCalledOnce();
    const [email, sender] = deps.sendEmail.mock.calls[0]!;
    expect(email.to).toBe('jean.dupont@example.nc');
    expect(email.subject).toBe('Votre facture FAC-2026-0001 — ALVM');
    expect(email.attachments).toEqual([
      { filename: 'facture-FAC-2026-0001.pdf', content: Buffer.from('%PDF-facture') },
    ]);
    expect(sender).toMatchObject({ fromName: 'ALVM', fromEmail: 'noreply@alvm.nc' });

    expect(lastUpdate()).toEqual({
      where: { id: MESSAGE_ID },
      data: {
        status: 'SENT',
        subject: 'Votre facture FAC-2026-0001 — ALVM',
        attempts: { increment: 1 },
        lastError: null,
        providerMessageId: 're_123',
        sentAt: NOW,
      },
      select: { id: true },
    });
  });

  it("s'exécute exclusivement dans le contexte RLS du tenant du job", async () => {
    await processEmailJob(invoiceJob(), deps);

    expect(contexts.length).toBeGreaterThanOrEqual(3);
    for (const context of contexts)
      expect(context).toEqual({ scope: 'tenant', organizationId: ORG_ID });
  });

  it('lit la ligne par un select whitelist', async () => {
    await processEmailJob(invoiceJob(), deps);

    expect(db.emailMessage.findFirst).toHaveBeenCalledWith({
      where: { id: MESSAGE_ID },
      select: {
        id: true,
        kind: true,
        recipient: true,
        subject: true,
        relatedId: true,
        status: true,
      },
    });
  });

  it('trace une tentative échouée sans conclure tant que des réessais restent', async () => {
    const providerError = new Error("Le fournisseur d'email a refusé l'envoi (HTTP 503).");
    deps.sendEmail.mockRejectedValue(providerError);

    await expect(processEmailJob(invoiceJob(0), deps)).rejects.toBe(providerError);

    expect(lastUpdate()).toEqual({
      where: { id: MESSAGE_ID },
      data: {
        attempts: { increment: 1 },
        lastError: "Le fournisseur d'email a refusé l'envoi (HTTP 503).",
      },
      select: { id: true },
    });
  });

  it('marque la ligne FAILED à la dernière tentative', async () => {
    deps.sendEmail.mockRejectedValue(new Error('HTTP 503'));

    await expect(processEmailJob(invoiceJob(2), deps)).rejects.toThrow('HTTP 503');

    expect(lastUpdate().data).toEqual({
      attempts: { increment: 1 },
      lastError: 'HTTP 503',
      status: 'FAILED',
    });
  });

  it("n'envoie rien si la ligne n'est pas (encore) visible et laisse BullMQ réessayer", async () => {
    db.emailMessage.findFirst.mockResolvedValue(null);

    await expect(processEmailJob(invoiceJob(), deps)).rejects.toThrow(/introuvable/);

    expect(deps.sendEmail).not.toHaveBeenCalled();
    expect(db.emailMessage.update).not.toHaveBeenCalled();
  });

  it('ignore un job rejoué dont le message est déjà traité', async () => {
    db.emailMessage.findFirst.mockResolvedValue(queuedMessage({ status: 'SENT' }));

    await expect(processEmailJob(invoiceJob(), deps)).resolves.toEqual({ status: 'SKIPPED' });

    expect(deps.sendEmail).not.toHaveBeenCalled();
    expect(db.emailMessage.update).not.toHaveBeenCalled();
  });

  it('conclut FAILED sans réessai quand la facture a disparu', async () => {
    deps.renderInvoicePdf.mockRejectedValue(
      new TRPCError({ code: 'NOT_FOUND', message: 'Facture non trouvée' }),
    );

    const failure = await processEmailJob(invoiceJob(0), deps).catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(UnrecoverableError);
    expect(deps.sendEmail).not.toHaveBeenCalled();
    expect(lastUpdate().data).toEqual({
      attempts: { increment: 1 },
      lastError: 'Facture non trouvée',
      status: 'FAILED',
    });
  });

  it('conclut FAILED quand le module email a été désactivé depuis la programmation', async () => {
    db.appSetting.findFirst.mockResolvedValue({ value: JSON.stringify({ email: false }) });

    const failure = await processEmailJob(invoiceJob(0), deps).catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(UnrecoverableError);
    expect(deps.sendEmail).not.toHaveBeenCalled();
    expect(lastUpdate().data).toMatchObject({ status: 'FAILED' });
  });

  it('envoie le lien de réinitialisation échappé, sans rendu PDF', async () => {
    db.emailMessage.findFirst.mockResolvedValue(
      queuedMessage({
        kind: 'password-reset',
        relatedId: 'a0000000-0000-4000-a000-000000000003',
        subject: 'Réinitialiser votre mot de passe Plateforme',
      }),
    );

    await expect(processEmailJob(resetJob(), deps)).resolves.toMatchObject({ status: 'SENT' });

    expect(deps.renderInvoicePdf).not.toHaveBeenCalled();
    const [email] = deps.sendEmail.mock.calls[0]!;
    expect(email.subject).toBe('Réinitialiser votre mot de passe Plateforme');
    expect(email.text).toContain('https://app.example.nc/auth/reset-password?token=abc&x=1');
    expect(email.html).toContain('?token=abc&amp;x=1');
    expect(email.attachments).toBeUndefined();
  });

  it("n'envoie pas un lien déjà expiré", async () => {
    db.emailMessage.findFirst.mockResolvedValue(queuedMessage({ kind: 'password-reset' }));

    const failure = await processEmailJob(resetJob('2026-09-27T09:59:59.000Z'), deps).catch(
      (e: unknown) => e,
    );

    expect(failure).toBeInstanceOf(UnrecoverableError);
    expect(deps.sendEmail).not.toHaveBeenCalled();
    expect(lastUpdate().data).toMatchObject({ status: 'FAILED' });
    // Jamais de lien (jeton) dans la trace d'erreur.
    expect(lastUpdate().data.lastError).not.toContain('token');
  });
});
