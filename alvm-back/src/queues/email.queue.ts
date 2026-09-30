/**
 * File d'emails `alvm-email` (BullMQ 5 + Redis) — CLAUDE.md InnovIA §5.11.
 *
 * Producteur (API) : `enqueueEmail()` crée la ligne `email_messages` (QUEUED)
 * dans la transaction du tenant PUIS ajoute le job. La ligne est l'autorité :
 * le worker n'envoie rien sans elle, et l'historique se lit en base, jamais
 * dans Redis.
 *
 * Consommateur : processus séparé `src/worker.ts` (même image), logique dans
 * `email.processor.ts`.
 *
 * Payload minimal : identifiants + données non persistables (lien de
 * réinitialisation, éphémère). Le PDF d'une facture est régénéré par le
 * worker depuis `email_messages.related_id` : aucun document dans Redis.
 */
import { Queue, type JobsOptions } from 'bullmq';
import IORedis from 'ioredis';
import { TRPCError } from '@trpc/server';

/** Convention `{projet}-{type}` ; BullMQ 5 refuse `:` dans un nom de file. */
export const EMAIL_QUEUE_NAME = 'alvm-email';

export type EmailKind = 'invoice' | 'password-reset';

interface EmailJobBase {
  /** Tenant de la ligne `email_messages` : le worker s'exécute dans son contexte RLS. */
  organizationId: string;
  emailMessageId: string;
}

export type EmailJobData =
  | (EmailJobBase & { kind: 'invoice' })
  | (EmailJobBase & {
      kind: 'password-reset';
      /** Lien porteur du jeton en clair : n'existe que dans Redis, le temps de l'envoi. */
      resetUrl: string;
      /** Au-delà, le lien est expiré : l'envoyer n'aurait aucun sens. */
      expiresAt: string;
    });

/** Tentatives par envoi (§5.11 : jobs critiques = 3 tentatives, backoff exponentiel). */
export const EMAIL_JOB_ATTEMPTS = 3;
/** Premier réessai après 15 s, le second après 30 s. */
export const EMAIL_JOB_BACKOFF_MS = 15_000;
/**
 * Délai avant la première tentative. Le job est ajouté AVANT la validation de
 * la transaction productrice (sinon un échec Redis laisserait une ligne sans
 * job) : ce délai laisse le COMMIT se faire. Un worker plus rapide ne trouve
 * pas encore la ligne et réessaie — jamais d'envoi sans ligne.
 */
export const EMAIL_JOB_START_DELAY_MS = 1_000;
/** Borne l'attente d'un Redis injoignable dans une requête utilisateur. */
const ENQUEUE_TIMEOUT_MS = 5_000;

export function emailJobOptions(kind: EmailKind, emailMessageId: string): JobsOptions {
  return {
    // Un même message ne peut être programmé deux fois.
    jobId: emailMessageId,
    attempts: EMAIL_JOB_ATTEMPTS,
    backoff: { type: 'exponential', delay: EMAIL_JOB_BACKOFF_MS },
    delay: EMAIL_JOB_START_DELAY_MS,
    removeOnComplete: true,
    // L'historique vit dans `email_messages` : Redis ne garde qu'une trace
    // technique bornée des échecs. Celle d'une réinitialisation contiendrait
    // un lien secret : supprimée immédiatement.
    removeOnFail: kind === 'password-reset' ? true : { age: 7 * 24 * 3600, count: 500 },
  };
}

/**
 * Connexion Redis dédiée.
 * - `worker` : `maxRetriesPerRequest: null`, exigé par BullMQ pour les
 *   commandes bloquantes.
 * - `producer` : échec rapide (pas de file hors ligne) — une requête
 *   utilisateur ne doit pas rester suspendue à un Redis tombé ; connexion
 *   paresseuse, ouverte au premier envoi.
 */
export function createRedisConnection(url: string, role: 'producer' | 'worker'): IORedis {
  return role === 'worker'
    ? new IORedis(url, { maxRetriesPerRequest: null })
    : new IORedis(url, {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        connectTimeout: ENQUEUE_TIMEOUT_MS,
      });
}

// ============================================================================
// PRODUCTEUR
// ============================================================================

let producer: { queue: Queue<EmailJobData>; connection: IORedis } | undefined;
let lastLoggedErrorAt = 0;

/** `true` si la file d'envoi est configurée sur cet environnement (REDIS_URL). */
export function isEmailQueueConfigured(): boolean {
  return Boolean(process.env.REDIS_URL?.trim());
}

/**
 * Échec explicite quand la file n'est pas configurée (dev sans Redis) : un
 * envoi ne doit jamais disparaître silencieusement.
 */
export function assertEmailQueueConfigured(
  message = "L'envoi d'email est indisponible : la file d'envoi n'est pas configurée sur cet environnement (REDIS_URL absente). Contactez l'administrateur.",
): void {
  if (!isEmailQueueConfigured()) throw new TRPCError({ code: 'PRECONDITION_FAILED', message });
}

function logQueueError(error: Error) {
  // Redis tombé : ioredis se reconnecte en boucle. Une trace par minute suffit.
  const now = Date.now();
  if (now - lastLoggedErrorAt < 60_000) return;
  lastLoggedErrorAt = now;
  console.error(`[email-queue] ${EMAIL_QUEUE_NAME} : ${error.message}`);
}

function getEmailQueue(): Queue<EmailJobData> {
  assertEmailQueueConfigured();
  if (!producer) {
    const connection = createRedisConnection(process.env.REDIS_URL!.trim(), 'producer');
    const queue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, { connection });
    // Sans écouteur, un 'error' émis par la file ferait tomber le processus.
    queue.on('error', logQueueError);
    producer = { queue, connection };
  }
  return producer.queue;
}

/** Ferme la connexion du producteur (arrêt de l'API, fin de test). */
export async function closeEmailQueue(): Promise<void> {
  if (!producer) return;
  const { queue, connection } = producer;
  producer = undefined;
  await queue.close().catch(() => undefined);
  // Connexion fournie à BullMQ : c'est à nous de la fermer.
  connection.disconnect();
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Redis n'a pas répondu en ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

interface EnqueueEmailBase {
  /** Tenant de la transaction `db` : la RLS refuse une ligne d'un autre tenant. */
  organizationId: string;
  recipient: string;
  /** Objet affiché dans l'historique (le corps n'est jamais persisté). */
  subject: string;
  relatedId?: string | null;
  createdBy?: string | null;
}

/** Interface minimale Prisma : client de transaction (ou mock de test). */
interface EmailMessageWriter {
  emailMessage: {
    create: (args: {
      data: {
        organizationId: string;
        kind: EmailKind;
        recipient: string;
        subject: string;
        relatedId: string | null;
        createdBy: string | null;
      };
      select: { id: true };
    }) => Promise<{ id: string }>;
  };
}

export type EnqueueEmailInput = EnqueueEmailBase &
  ({ kind: 'invoice' } | { kind: 'password-reset'; resetUrl: string; expiresAt: Date });

/**
 * Programme un email : ligne `email_messages` (QUEUED) dans la transaction du
 * tenant, puis job `alvm-email`.
 *
 * À appeler en dernier dans la transaction : si l'ajout du job échoue, l'erreur
 * annule la transaction et la ligne disparaît avec elle (jamais de ligne
 * QUEUED orpheline).
 *
 * @throws TRPCError PRECONDITION_FAILED si la file n'est pas configurée,
 *         SERVICE_UNAVAILABLE si Redis est injoignable.
 */
export async function enqueueEmail(
  db: EmailMessageWriter,
  input: EnqueueEmailInput,
): Promise<{ emailMessageId: string }> {
  const queue = getEmailQueue();

  const { id: emailMessageId } = await db.emailMessage.create({
    data: {
      organizationId: input.organizationId,
      kind: input.kind,
      recipient: input.recipient,
      subject: input.subject,
      relatedId: input.relatedId ?? null,
      createdBy: input.createdBy ?? null,
    },
    select: { id: true },
  });

  const base = { organizationId: input.organizationId, emailMessageId };
  const data: EmailJobData =
    input.kind === 'password-reset'
      ? {
          ...base,
          kind: 'password-reset',
          resetUrl: input.resetUrl,
          expiresAt: input.expiresAt.toISOString(),
        }
      : { ...base, kind: 'invoice' };

  try {
    await withTimeout(
      queue.add(input.kind, data, emailJobOptions(input.kind, emailMessageId)),
      ENQUEUE_TIMEOUT_MS,
    );
  } catch (error) {
    console.error(
      `[email-queue] programmation impossible (${input.kind}, ${emailMessageId}) : ${
        error instanceof Error ? error.message : error
      }`,
    );
    // Une file dont la connexion initiale a échoué ne se rétablit pas seule :
    // la prochaine programmation repartira d'une connexion neuve.
    await closeEmailQueue();
    throw new TRPCError({
      code: 'SERVICE_UNAVAILABLE',
      message: "La file d'envoi des emails est injoignable. Réessayez dans quelques instants.",
    });
  }

  return { emailMessageId };
}
