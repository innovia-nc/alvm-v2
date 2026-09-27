/**
 * Traitement d'un job de la file `alvm-email` (exécuté par `src/worker.ts`).
 *
 * Déroulé, toujours dans le contexte RLS du tenant du job :
 *   1. lecture de la ligne `email_messages` — absente : la transaction
 *      productrice n'est pas (encore) validée → réessai, jamais d'envoi ;
 *      déjà SENT/FAILED : job rejoué → ignoré ;
 *   2. composition du message depuis l'état COURANT (PDF de facture régénéré,
 *      identité d'expédition du tenant) ;
 *   3. envoi HORS transaction (aucune connexion base retenue pendant l'appel
 *      au fournisseur) ;
 *   4. mise à jour de la ligne : SENT, ou tentative échouée (`attempts`,
 *      `last_error`) — FAILED à la dernière tentative ou sur erreur
 *      définitive (facture supprimée, module désactivé, lien expiré).
 *
 * Garantie « au moins une fois » : si l'envoi réussit mais que la mise à jour
 * échoue, le réessai peut produire un doublon. Le corps et les jetons ne sont
 * jamais persistés ni journalisés.
 */
import { UnrecoverableError } from 'bullmq';
import { TRPCError } from '@trpc/server';
import { withDbContext, type Db } from '@back/db-context';
import { getEmailSender, sendEmail } from '@back/services/email.service';
import { generateAndStoreInvoicePdf } from '@back/services/invoice-pdf.service';
import { getPdfSettings } from '@back/helpers/pdf-settings.helper';
import { getFeatures } from '@back/helpers/features';
import { toNum } from '@back/helpers/decimal';
import { buildInvoiceEmail, buildPasswordResetEmail } from '@back/services/email-templates';
import type { EmailJobData } from './email.queue';

/** Ce que le traitement lit d'un job BullMQ (sous-ensemble de `Job`). */
export interface EmailJob {
  id?: string;
  data: EmailJobData;
  /** Tentatives déjà terminées avant celle-ci. */
  attemptsMade: number;
  opts: { attempts?: number };
}

export interface EmailProcessorDeps {
  withDb: typeof withDbContext;
  sendEmail: typeof sendEmail;
  /** Rendu du PDF de facture, sans archivage (même chemin que le téléchargement). */
  renderInvoicePdf: (
    db: Db,
    invoiceId: string,
  ) => Promise<{ invoice: InvoiceForEmail; pdfBuffer: Buffer }>;
  now: () => Date;
}

interface InvoiceForEmail {
  invoiceNumber: string;
  status: string;
  totalAmount: Parameters<typeof toNum>[0];
  dueDate: Date;
  parent: { firstName: string; lastName: string };
}

const defaultDeps: EmailProcessorDeps = {
  withDb: withDbContext,
  sendEmail,
  renderInvoicePdf: (db, invoiceId) => generateAndStoreInvoicePdf(db, invoiceId, false),
  now: () => new Date(),
};

export type EmailJobResult = { status: 'SENT'; providerMessageId: string } | { status: 'SKIPPED' };

/** Erreur qu'un réessai ne corrigera pas : la ligne passe FAILED sans attendre. */
export class PermanentEmailError extends Error {
  override name = 'PermanentEmailError';
}

const MAX_ERROR_LENGTH = 500;

function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, MAX_ERROR_LENGTH);
}

function isPermanent(error: unknown): boolean {
  return (
    error instanceof PermanentEmailError ||
    // Facture introuvable (supprimée entre la programmation et l'envoi).
    (error instanceof TRPCError && error.code === 'NOT_FOUND')
  );
}

type QueuedMessage = {
  id: string;
  kind: string;
  recipient: string;
  subject: string;
  relatedId: string | null;
  status: 'QUEUED' | 'SENT' | 'FAILED';
};

/** Compose le message complet à partir de l'état courant (dans la transaction du tenant). */
async function composeEmail(
  db: Db,
  message: QueuedMessage,
  data: EmailJobData,
  deps: EmailProcessorDeps,
) {
  if (message.kind !== data.kind)
    throw new PermanentEmailError(`Job ${data.kind} incohérent avec le message ${message.kind}.`);
  const sender = await getEmailSender(db);

  if (data.kind === 'password-reset') {
    if (new Date(data.expiresAt) <= deps.now())
      throw new PermanentEmailError('Lien de réinitialisation expiré avant l’envoi.');
    return { sender, email: buildPasswordResetEmail(message.subject, data.resetUrl) };
  }

  // Emails métier : le module peut avoir été coupé depuis la programmation.
  const features = await getFeatures(db);
  if (!features.application || !features.email)
    throw new PermanentEmailError('Module email désactivé pour cette association.');
  if (!message.relatedId) throw new PermanentEmailError('Facture non référencée.');

  const { invoice, pdfBuffer } = await deps.renderInvoicePdf(db, message.relatedId);
  const pdfSettings = await getPdfSettings(db);
  const { attachmentName, ...email } = buildInvoiceEmail(
    { ...invoice, totalAmount: toNum(invoice.totalAmount) },
    pdfSettings.org.shortName || pdfSettings.org.name,
  );
  return {
    sender,
    email: { ...email, attachments: [{ filename: attachmentName, content: pdfBuffer }] },
  };
}

export async function processEmailJob(
  job: EmailJob,
  deps: EmailProcessorDeps = defaultDeps,
): Promise<EmailJobResult> {
  const { organizationId, emailMessageId } = job.data;
  const tenant = { scope: 'tenant', organizationId } as const;
  const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);

  const message = await deps.withDb(tenant, (db) =>
    db.emailMessage.findFirst({
      where: { id: emailMessageId },
      select: {
        id: true,
        kind: true,
        recipient: true,
        subject: true,
        relatedId: true,
        status: true,
      },
    }),
  );
  if (!message)
    throw new Error(
      `Message ${emailMessageId} introuvable : transaction de programmation non validée${
        finalAttempt ? ' — abandon' : ''
      }.`,
    );
  if (message.status !== 'QUEUED') return { status: 'SKIPPED' };

  try {
    const { sender, email } = await deps.withDb(tenant, (db) =>
      composeEmail(db, message, job.data, deps),
    );
    const { id: providerMessageId } = await deps.sendEmail(
      { to: message.recipient, ...email },
      sender,
    );
    await deps.withDb(tenant, (db) =>
      db.emailMessage.update({
        where: { id: message.id },
        data: {
          status: 'SENT',
          // Objet réellement envoyé (un devis devenu facture entre-temps).
          subject: email.subject,
          attempts: { increment: 1 },
          lastError: null,
          providerMessageId: providerMessageId || null,
          sentAt: deps.now(),
        },
        select: { id: true },
      }),
    );
    return { status: 'SENT', providerMessageId };
  } catch (error) {
    const permanent = isPermanent(error);
    await deps.withDb(tenant, (db) =>
      db.emailMessage.update({
        where: { id: message.id },
        data: {
          attempts: { increment: 1 },
          lastError: describe(error),
          ...(permanent || finalAttempt ? { status: 'FAILED' as const } : {}),
        },
        select: { id: true },
      }),
    );
    throw permanent ? new UnrecoverableError(describe(error)) : error;
  }
}
