/**
 * Téléchargement des documents : `GET /api/documents/:kind/:id`.
 *
 * `invoice` et `credit` sont régénérés à la demande ; `child` et `staff` sont
 * relus depuis le stockage privé. Un parent n'atteint que ses propres pièces et
 * les documents de ses enfants ; tout refus est un 404 indistinct.
 */
import { get } from '@vercel/blob';
import { getIntegrationSecret } from '@back/services/platform-config.service';
import { hasChildAccess } from '@back/helpers/child-access.helper';
import { generateAndStoreInvoicePdf } from '@back/services/invoice-pdf.service';
import {
  openTenantRequest,
  PDF_HEADERS,
  textError,
  type RequestUser,
} from '@back/http/tenant-request';

const KINDS = {
  invoice: 'invoices',
  credit: 'creditNotes',
  child: 'children',
  staff: 'staff',
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function handleDocumentDownload(
  params: { kind: string; id: string },
  user: RequestUser | null,
): Promise<Response> {
  const { kind, id } = params;
  if (!(kind in KINDS)) return textError('Non trouvé', 404);
  const tenant = await openTenantRequest(
    user,
    ['documents', KINDS[kind as keyof typeof KINDS]],
    textError,
  );
  if (tenant instanceof Response) return tenant;
  if (!UUID.test(id)) return textError('Non trouvé', 404);

  const { role, id: userId } = tenant.user;
  const headers = { ...PDF_HEADERS, 'Content-Disposition': 'attachment; filename="document.pdf"' };

  if (kind === 'invoice') {
    const pdf = await tenant.run(async (db) => {
      const invoice = await db.invoice.findFirst({
        where: {
          id,
          deletedAt: null,
          invoiceType: 'INVOICE',
          ...(role === 'PARENT' ? { parentId: userId } : {}),
        },
        select: { id: true },
      });
      if (!invoice) return null;
      return (await generateAndStoreInvoicePdf(db, id, false)).pdfBuffer;
    });
    if (!pdf) return textError('Non trouvé', 404);
    return new Response(new Uint8Array(pdf), { headers });
  }

  if (kind === 'credit') {
    const data = await tenant.run(async (db) => {
      const credit = await db.invoice.findFirst({
        where: {
          id,
          invoiceType: 'CREDIT_NOTE',
          deletedAt: null,
          ...(role === 'PARENT' ? { parentId: userId } : {}),
        },
        select: {
          invoiceNumber: true,
          issueDate: true,
          totalAmount: true,
          notes: true,
          parent: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              address: true,
              city: true,
              postalCode: true,
            },
          },
          creditedInvoice: { select: { invoiceNumber: true } },
          lines: {
            where: { deletedAt: null },
            select: { description: true, quantity: true, unitPrice: true, totalHt: true, totalPrice: true },
          },
        },
      });
      if (!credit) return null;
      const { getPdfSettings } = await import('@back/helpers/pdf-settings.helper');
      return { credit, settings: await getPdfSettings(db) };
    });
    if (!data) return textError('Non trouvé', 404);
    const { credit, settings } = data;
    const { generateCreditNotePDF } = await import('@back/pdf/credit-note-pdf');
    const buffer = await generateCreditNotePDF({
      creditNoteNumber: credit.invoiceNumber,
      issueDate: credit.issueDate,
      invoiceNumber: credit.creditedInvoice?.invoiceNumber ?? 'Aucune',
      parent: credit.parent,
      // Montants négatifs en base, le PDF pose lui-même le signe (CLAUDE.md).
      lines: credit.lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unitPrice: Math.abs(Number(l.unitPrice)),
        totalPrice: Math.abs(Number(l.totalHt ?? l.totalPrice)),
      })),
      totalAmount: Math.abs(Number(credit.totalAmount)),
      reason: credit.notes ?? '',
      org: settings.org,
      footerMention: settings.mentions.creditNote || undefined,
    });
    return new Response(new Uint8Array(buffer), { headers });
  }

  const url = await tenant.run(async (db) => {
    if (kind === 'child') {
      const document = await db.childDocument.findFirst({
        where: { id, deletedAt: null },
        select: { childId: true, fileUrl: true },
      });
      return document && (await hasChildAccess(db, userId, role, document.childId))
        ? document.fileUrl
        : undefined;
    }
    if (role !== 'ADMIN' && role !== 'STAFF') return undefined;
    const document = await db.staffDocument.findFirst({
      where: { id, deletedAt: null, staff: { deletedAt: null } },
      select: { fileUrl: true },
    });
    return document?.fileUrl;
  });
  if (!url) return textError('Non trouvé', 404);

  // Les objets publics hérités doivent être migrés avant d'être servis ici.
  const source = URL.canParse(url) ? new URL(url) : null;
  if (
    source?.protocol !== 'https:' ||
    !source.hostname.endsWith('.private.blob.vercel-storage.com')
  )
    return textError('Document en cours de migration. Contactez le secrétariat.', 409);
  const token = await getIntegrationSecret('blobPrivate');
  if (!token) return textError('Stockage privé indisponible', 503);
  const blob = await get(url, { access: 'private', token, useCache: false });
  if (!blob || blob.statusCode !== 200) return textError('Non trouvé', 404);
  return new Response(blob.stream, { headers });
}
