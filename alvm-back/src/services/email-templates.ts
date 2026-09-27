/**
 * Contenu des emails transactionnels de la file `alvm-email`.
 *
 * Fonctions pures, partagées par le producteur (qui persiste l'objet dans
 * `email_messages` au moment de la programmation) et par le worker (qui
 * reconstruit le message complet au moment de l'envoi, à partir de l'état
 * courant du document). Le corps n'est jamais persisté.
 *
 * Tout texte d'origine utilisateur passe par `escapeHtml` (CLAUDE.md InnovIA §5.13).
 */
import { escapeHtml } from '@alvm/shared/validation/escape-html';

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/** Champs de la facture lus pour composer l'email (whitelist, §5.9). */
export interface InvoiceEmailSource {
  invoiceNumber: string;
  status: string;
  totalAmount: number;
  dueDate: Date;
  parent: { firstName: string; lastName: string };
}

/**
 * Email d'envoi d'une facture — ou d'un devis tant qu'elle est en brouillon
 * (« Envoyer le devis » des écrans admin).
 */
export function buildInvoiceEmail(
  invoice: InvoiceEmailSource,
  organizationName: string,
): RenderedEmail & { attachmentName: string } {
  const isQuote = invoice.status === 'DRAFT';
  const label = isQuote ? 'devis' : 'facture';
  const amount = `${invoice.totalAmount.toLocaleString('fr-FR')} XPF`;
  const dueDate = new Date(invoice.dueDate).toLocaleDateString('fr-FR');
  const greeting = `${invoice.parent.firstName} ${invoice.parent.lastName}`.trim();

  const lines = [
    `Bonjour ${greeting},`,
    isQuote
      ? `Vous trouverez en pièce jointe votre devis ${invoice.invoiceNumber} d'un montant de ${amount}.`
      : `Vous trouverez en pièce jointe votre facture ${invoice.invoiceNumber} d'un montant de ${amount}, à régler avant le ${dueDate}.`,
    `Pour toute question, répondez simplement à cet email.`,
    `Cordialement,`,
    organizationName,
  ];

  return {
    subject: `Votre ${label} ${invoice.invoiceNumber} — ${organizationName}`,
    text: lines.join('\n\n'),
    html: lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('\n'),
    attachmentName: `${label}-${invoice.invoiceNumber}.pdf`,
  };
}

/** Objet de l'email de réinitialisation (persisté pour l'historique). */
export function passwordResetSubject(platformName: string): string {
  return `Réinitialiser votre mot de passe ${platformName}`;
}

/**
 * Email de réinitialisation du mot de passe. Le lien porte un jeton en clair :
 * il n'existe que dans ce corps (jamais en base, où seule son empreinte est
 * conservée).
 */
export function buildPasswordResetEmail(subject: string, resetUrl: string): RenderedEmail {
  return {
    subject,
    text: `Lien valable 30 minutes : ${resetUrl}`,
    html: `<p><a href="${escapeHtml(resetUrl)}">Réinitialiser mon mot de passe</a> (30 minutes)</p>`,
  };
}
