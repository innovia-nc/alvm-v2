/**
 * Génération + archivage du PDF d'une facture.
 *
 * Extrait de `invoices.generatePDF` (TD-008) pour que l'envoi par email
 * réutilise exactement la même chaîne : même requête (whitelist de select),
 * même rendu, même objet archivé sur le store Blob. Une pièce jointe qui
 * diverge du PDF téléchargeable serait un défaut invisible en test et
 * embarrassant en production.
 */

import { TRPCError } from '@trpc/server';
import { toNum } from '@/server/helpers/decimal';

/**
 * Client Prisma — compatible avec PrismaClient et les clients étendus
 * (extension soft-delete, callback `$transaction`). Même convention que
 * `credit-application.service.ts`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PrismaLike = any;

export interface InvoicePdfResult {
  /** Facture telle que lue pour le rendu (numéro, statut, parent, montants…). */
  invoice: PrismaLike;
  /** PDF rendu, utilisable directement en pièce jointe. */
  pdfBuffer: Buffer;
  /** URL publique de l'objet archivé, également mémorisée sur la facture. */
  pdfUrl: string;
}

/**
 * Rend le PDF de la facture, l'archive sur le store Blob et mémorise son URL.
 *
 * @throws TRPCError NOT_FOUND si la facture n'existe pas (ou est archivée)
 */
export async function generateAndStoreInvoicePdf(
  prisma: PrismaLike,
  invoiceId: string,
): Promise<InvoicePdfResult> {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, deletedAt: null },
    include: {
      parent: {
        select: {
          firstName: true,
          lastName: true,
          email: true,
          address: true,
          city: true,
          postalCode: true,
        },
      },
      lines: {
        where: { deletedAt: null },
        select: {
          description: true,
          quantity: true,
          unitPrice: true,
          totalPrice: true,
        },
      },
      payments: {
        // Select whitelist : aucun champ sensible (référence bancaire,
        // notes internes, opérateur de saisie) ne doit fuir dans le PDF.
        select: {
          amount: true,
          paymentDate: true,
          paymentMethod: {
            select: { name: true },
          },
          // Numéro de l'avoir imputé, pour les règlements par avoir
          // (US-FACT-02 — traçabilité sur la facture).
          creditNote: {
            select: { invoiceNumber: true },
          },
        },
        orderBy: { paymentDate: 'asc' },
      },
    },
  });

  if (!invoice) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Facture non trouvée' });
  }

  const { getPdfSettings } = await import('@/server/helpers/pdf-settings.helper');
  const pdfSettings = await getPdfSettings(prisma);

  const logoSetting = await prisma.appSetting.findUnique({
    where: { category_key: { category: 'organization', key: 'logo_url' } },
    select: { value: true },
  });
  const logoUrl: string | undefined = (() => {
    const raw = logoSetting?.value;
    if (!raw) return undefined;
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === 'string' ? parsed : undefined;
    } catch {
      return raw;
    }
  })();

  const { generateInvoicePDF } = await import('@/lib/pdf/invoice-pdf');
  const { uploadToStorage } = await import('@/lib/storage/blob-storage');

  const pdfBuffer = await generateInvoicePDF({
    invoiceNumber: invoice.invoiceNumber,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    status: invoice.status as 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'CANCELLED',
    parent: invoice.parent,
    lines: invoice.lines.map((l: PrismaLike) => ({
      description: l.description,
      quantity: l.quantity,
      unitPrice: toNum(l.unitPrice),
      totalPrice: toNum(l.totalPrice),
    })),
    payments: invoice.payments.map((p: PrismaLike) => ({
      amount: toNum(p.amount),
      paymentDate: p.paymentDate,
      paymentMethod: p.paymentMethod.name,
      creditNoteNumber: p.creditNote?.invoiceNumber ?? null,
    })),
    subtotalHt: toNum(invoice.subtotalHt),
    taxAmount: toNum(invoice.taxAmount),
    taxRate: toNum(invoice.taxRate) * 100,
    totalAmount: toNum(invoice.totalAmount),
    paidAmount: toNum(invoice.paidAmount),
    org: pdfSettings.org,
    footerMention: pdfSettings.mentions.invoice || undefined,
    logoUrl,
  });

  const pathname = `invoices/${invoice.invoiceNumber}-${invoice.id}.pdf`;

  const { url } = await uploadToStorage(pdfBuffer, {
    pathname,
    contentType: 'application/pdf',
  });

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { pdfUrl: url },
  });

  return { invoice, pdfBuffer, pdfUrl: url };
}
