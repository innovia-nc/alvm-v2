import { NextResponse } from 'next/server';
import { get } from '@vercel/blob';
import { auth } from '@/lib/auth';
import { prisma } from '@/server/db';
import { hasChildAccess } from '@/server/helpers/child-access.helper';
import { generateAndStoreInvoicePdf } from '@/server/services/invoice-pdf.service';

export const maxDuration = 60;
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const session = await auth();
  if (!session?.user) return new NextResponse('Non authentifié', { status: 401 });
  const { kind, id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse('Non trouvé', { status: 404 });
  const role = session.user.role ?? 'PARENT';
  const headers = {
    'Content-Type': 'application/pdf',
    'Cache-Control': 'private, no-store',
    'Content-Disposition': 'attachment; filename="document.pdf"',
  };
  if (kind === 'invoice') {
    const invoice = await prisma.invoice.findFirst({
      where: {
        id,
        deletedAt: null,
        invoiceType: 'INVOICE',
        ...(role === 'PARENT' ? { parentId: session.user.id } : {}),
      },
    });
    if (!invoice) return new NextResponse('Non trouvé', { status: 404 });
    const { pdfBuffer } = await generateAndStoreInvoicePdf(prisma, id, false);
    return new NextResponse(new Uint8Array(pdfBuffer), { headers });
  }
  if (kind === 'credit') {
    const credit = await prisma.invoice.findFirst({
      where: {
        id,
        invoiceType: 'CREDIT_NOTE',
        deletedAt: null,
        ...(role === 'PARENT' ? { parentId: session.user.id } : {}),
      },
      include: { parent: true, creditedInvoice: true, lines: { where: { deletedAt: null } } },
    });
    if (!credit) return new NextResponse('Non trouvé', { status: 404 });
    const { generateCreditNotePDF } = await import('@/lib/pdf/credit-note-pdf');
    const { getPdfSettings } = await import('@/server/helpers/pdf-settings.helper');
    const settings = await getPdfSettings(prisma);
    const buffer = await generateCreditNotePDF({
      creditNoteNumber: credit.invoiceNumber,
      issueDate: credit.issueDate,
      invoiceNumber: credit.creditedInvoice?.invoiceNumber ?? 'Aucune',
      parent: credit.parent,
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
    return new NextResponse(new Uint8Array(buffer), { headers });
  }
  let url: string | undefined;
  if (kind === 'child') {
    const document = await prisma.childDocument.findFirst({ where: { id, deletedAt: null } });
    if (document && (await hasChildAccess(prisma, session.user.id, role, document.childId)))
      url = document.fileUrl;
  } else if (kind === 'staff' && (role === 'ADMIN' || role === 'STAFF')) {
    const document = await prisma.staffDocument.findFirst({
      where: { id, deletedAt: null, staff: { deletedAt: null } },
    });
    url = document?.fileUrl;
  }
  if (!url) return new NextResponse('Non trouvé', { status: 404 });
  // Legacy public objects must be migrated before they can be served here.
  const source = URL.canParse(url) ? new URL(url) : null;
  if (source?.protocol !== 'https:' || !source.hostname.endsWith('.private.blob.vercel-storage.com'))
    return new NextResponse('Document en cours de migration. Contactez le secrétariat.', {
      status: 409,
    });
  const blob = await get(url, {
    access: 'private',
    token: process.env.BLOB_PRIVATE_READ_WRITE_TOKEN,
    useCache: false,
  });
  if (!blob || blob.statusCode !== 200) return new NextResponse('Non trouvé', { status: 404 });
  return new NextResponse(blob.stream, { headers });
}
