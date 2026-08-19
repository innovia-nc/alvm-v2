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

/**
 * Numero sequentiel d'un document : `PREFIXE-ANNEE-0001`.
 *
 * Pas de parametre d'horloge injectable : le seul usage de la date est
 * l'annee du numero, aucun appelant n'en a jamais passe une, et un test qui
 * en aurait besoin peut geler le temps avec `vi.setSystemTime`. Le parametre
 * `now` et l'alias `generateInvoiceNumber` (qui ne faisait que restreindre
 * `kind`) sont retires a la sixieme passe de code mort.
 */
export async function generateDocumentNumber(
  prisma: RawClient,
  kind: DocumentKind,
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
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${String(next).padStart(4, '0')}`;
}
