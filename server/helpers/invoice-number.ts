type DocumentKind = 'INVOICE' | 'CREDIT_NOTE' | 'PAYMENT' | 'REFUND';

interface RawClient {
  $queryRawUnsafe: <T = unknown>(query: string) => Promise<T>;
  $executeRawUnsafe: (query: string) => Promise<number>;
}

const SEQUENCES: Record<DocumentKind, { name: string; prefix: string }> = {
  INVOICE: { name: 'invoice_number_seq', prefix: 'FAC' },
  CREDIT_NOTE: { name: 'credit_note_number_seq', prefix: 'AVO' },
  PAYMENT: { name: 'payment_number_seq', prefix: 'PAI' },
  REFUND: { name: 'refund_number_seq', prefix: 'REM' },
};

const ensuredSequences = new Set<string>();

export async function generateDocumentNumber(
  prisma: RawClient,
  kind: DocumentKind,
  now: Date = new Date(),
): Promise<string> {
  const { name, prefix } = SEQUENCES[kind];

  if (!ensuredSequences.has(name)) {
    await prisma.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS ${name}`);
    ensuredSequences.add(name);
  }

  const rows = await prisma.$queryRawUnsafe<Array<{ nextval: bigint | number }>>(
    `SELECT nextval('${name}') AS nextval`,
  );
  const next = Number(rows[0]?.nextval ?? 0);
  const year = now.getFullYear();
  return `${prefix}-${year}-${String(next).padStart(4, '0')}`;
}

// Backwards-compatible alias for invoice/credit-note callers
export async function generateInvoiceNumber(
  prisma: RawClient,
  kind: 'INVOICE' | 'CREDIT_NOTE',
  now: Date = new Date(),
): Promise<string> {
  return generateDocumentNumber(prisma, kind, now);
}
