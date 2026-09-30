import type { Db } from '@back/db-context';

type DocumentKind = 'INVOICE' | 'CREDIT_NOTE' | 'PAYMENT' | 'REFUND';

const PREFIXES: Record<DocumentKind, string> = {
  INVOICE: 'FAC',
  CREDIT_NOTE: 'AVO',
  PAYMENT: 'PAI',
  REFUND: 'REM',
};

/**
 * Incrémente le compteur `kind` du tenant de la transaction et renvoie la
 * nouvelle valeur.
 *
 * `document_counters` remplace les séquences PostgreSQL globales de
 * l'installation mono-tenant : chaque association numérote ses pièces depuis 1,
 * et le compteur étant transactionnel, une transaction annulée ne laisse pas
 * de trou dans la numérotation. La ligne verrouillée par l'upsert sérialise
 * les créations concurrentes d'un même tenant.
 */
export async function nextCounterValue(db: Pick<Db, '$queryRaw'>, kind: string): Promise<number> {
  const rows = await db.$queryRaw<Array<{ value: bigint | number }>>`
    INSERT INTO document_counters (kind, value, updated_at) VALUES (${kind}, 1, NOW())
    ON CONFLICT (organization_id, kind)
    DO UPDATE SET value = document_counters.value + 1, updated_at = NOW()
    RETURNING value`;
  const value = Number(rows[0]?.value);
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error(`Compteur de pièces ${kind} illisible.`);
  return value;
}

/**
 * Numero sequentiel d'un document : `PREFIXE-ANNEE-0001`, propre au tenant.
 *
 * Pas de parametre d'horloge injectable : le seul usage de la date est
 * l'annee du numero, et un test qui en aurait besoin peut geler le temps avec
 * `vi.setSystemTime`.
 */
export async function generateDocumentNumber(
  db: Pick<Db, '$queryRaw'>,
  kind: DocumentKind,
): Promise<string> {
  const next = await nextCounterValue(db, kind);
  const year = new Date().getFullYear();
  return `${PREFIXES[kind]}-${year}-${String(next).padStart(4, '0')}`;
}
