/**
 * Service d'envoi d'emails transactionnels (TD-008).
 *
 * Fournisseur : Resend, appelé via son API REST (`fetch`) — aucun SDK à
 * embarquer dans le bundle serverless.
 *
 * Configuration en deux morceaux, volontairement séparés :
 * - la **clé d'API** vient de l'environnement (`RESEND_API_KEY`), comme tout
 *   secret du projet — elle n'a rien à faire dans `app_settings` ;
 * - l'**identité d'expédition** (nom, adresse, reply-to) vient des settings
 *   `email` administrables depuis /dashboard/admin/settings.
 *
 * Si la clé est absente, `isEmailConfigured()` retourne `false` et les
 * appelants doivent le dire explicitement à l'utilisateur : une action qui
 * échoue en silence (ou avec un code d'erreur inventé) est pire que pas
 * d'action du tout.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

// ============================================================================
// TYPES
// ============================================================================

export interface EmailAttachment {
  filename: string;
  content: Buffer;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  /** Corps HTML. */
  html: string;
  /** Corps texte, pour les clients qui n'affichent pas le HTML. */
  text?: string;
  attachments?: EmailAttachment[];
}

export interface EmailSender {
  fromName: string;
  fromEmail: string;
  replyTo?: string;
}

/** Interface minimale Prisma : suffit aux tests, compatible client étendu. */
interface HasAppSettingFindMany {
  appSetting: {
    findMany: (args: {
      where: { category: string };
      select: { key: true; value: true };
    }) => Promise<Array<{ key: string; value: string | null }>>;
  };
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * `true` si l'envoi d'email est opérationnel sur cet environnement.
 * Exposé au front (`settings.isEmailConfigured`) pour que les boutons d'envoi
 * ne proposent pas une action vouée à l'échec.
 */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/** Parse un setting JSON-stringified (cf. router settings.update). */
function parseSetting(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'string' && parsed.trim() ? parsed : undefined;
  } catch {
    return raw.trim() ? raw : undefined;
  }
}

/**
 * Lit l'identité d'expédition dans les settings `email`.
 * Fallbacks alignés sur le seed (`prisma/seed.ts`).
 */
export async function getEmailSender(
  prisma: HasAppSettingFindMany,
): Promise<EmailSender> {
  const rows = await prisma.appSetting.findMany({
    where: { category: 'email' },
    select: { key: true, value: true },
  });

  const map = new Map(rows.map((r) => [r.key, parseSetting(r.value)]));

  return {
    fromName: map.get('from_name') ?? 'ALVM',
    fromEmail: map.get('from_email') ?? 'noreply@alvm.nc',
    replyTo: map.get('reply_to'),
  };
}

/**
 * Échappe une chaîne destinée au corps HTML d'un email.
 *
 * Les données injectées viennent de la base (nom du client, numéro de pièce,
 * nom de l'organisation) : elles sont saisies par des humains et peuvent
 * contenir `&`, `<`, `"`… qui casseraient le rendu du message.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ============================================================================
// ENVOI
// ============================================================================

/**
 * Envoie un email transactionnel.
 *
 * @throws si la clé d'API est absente ou si le fournisseur rejette l'envoi —
 *         l'appelant (router tRPC) traduit en `TRPCError` avec un message
 *         lisible par l'utilisateur.
 */
export async function sendEmail(
  input: SendEmailInput,
  sender: EmailSender,
): Promise<{ id: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Envoi d'email non configuré : RESEND_API_KEY absent de l'environnement.",
    );
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${sender.fromName} <${sender.fromEmail}>`,
      to: [input.to],
      ...(sender.replyTo ? { reply_to: sender.replyTo } : {}),
      subject: input.subject,
      html: input.html,
      ...(input.text ? { text: input.text } : {}),
      ...(input.attachments?.length
        ? {
            attachments: input.attachments.map((a) => ({
              filename: a.filename,
              content: a.content.toString('base64'),
            })),
          }
        : {}),
    }),
  });

  if (!response.ok) {
    // Le corps d'erreur Resend est du JSON `{ name, message }`, mais on ne peut
    // pas en dépendre (proxy, 502 HTML…) : on retombe sur le texte brut.
    const detail = await response.text().catch(() => '');
    throw new Error(
      `Le fournisseur d'email a refusé l'envoi (HTTP ${response.status}). ${detail}`.trim(),
    );
  }

  const payload = (await response.json().catch(() => ({}))) as { id?: string };
  return { id: payload.id ?? '' };
}
