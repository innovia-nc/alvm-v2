/**
 * Initialise une base PostgreSQL NEUVE (staging srv-innovia, prod srv-ovh).
 *
 * Le projet n'a pas d'historique `prisma/migrations` : le schéma est posé par
 * `prisma db push`, puis les invariants que Prisma ne modélise pas (trigger de
 * statut de paiement, séquences de numérotation, index partiel d'inscription,
 * CHECK code postal) et les réglages `pricing` (TGC = 0, exonération LP 492).
 *
 * Refuse de tourner sur une base qui contient déjà des tables : les évolutions
 * d'une base en service passent par `prisma/migrations-manual/` (SQL relu,
 * répété sur clone), jamais par ce script.
 *
 * Image Docker : `./docker-entrypoint.sh db-init`. Poste de dev : `pnpm db:init`.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const INVARIANTS = [
  '2026-09-22-business-invariants.sql',
  '2026-07-06-postal-code-check.sql',
  '2026-07-06-seed-pricing-settings.sql',
];

const root = process.env.APP_ROOT ?? process.cwd();
const schema = path.join(root, 'prisma', 'schema.prisma');
const prismaBin = process.env.PRISMA_BIN ?? 'prisma';

function prismaCli(args: string[]) {
  execFileSync(prismaBin, [...args, '--schema', schema], { stdio: 'inherit' });
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const [{ count }] = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT count(*) AS count FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    if (Number(count) > 0)
      throw new Error(
        `La base contient déjà ${count} table(s) : db-init ne s'applique qu'à une base neuve.`,
      );
  } finally {
    await prisma.$disconnect();
  }

  console.log('[db-init] Schéma (prisma db push)…');
  prismaCli(['db', 'push', '--skip-generate']);

  for (const file of INVARIANTS) {
    console.log(`[db-init] ${file}…`);
    prismaCli(['db', 'execute', '--file', path.join(root, 'prisma', 'migrations-manual', file)]);
  }
  console.log('[db-init] Terminé. Étapes suivantes : seed-payment-methods, create-super-admin.');
}

main().catch((error) => {
  console.error(`[db-init] ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
