/**
 * Intégrité inter-tenants de toute la base (vue de contrôle propriétaire).
 *
 * PostgreSQL vérifie les clés étrangères HORS RLS : une ligne d'une
 * association peut donc référencer une ligne d'une autre si le code applicatif
 * ne vérifie pas lui-même la visibilité de l'identifiant reçu. Ce contrôle
 * parcourt TOUTES les clés étrangères entre tables portant `organization_id`
 * et signale chaque référence qui franchit la frontière d'un tenant.
 *
 * Seule exception : une référence vers un compte SUPER_ADMIN (auteur d'un
 * réglage d'association posé par la super administration, `updated_by`).
 */
import type { PrismaClient } from '@prisma/client';
import { ident } from './db';

interface ForeignKey {
  table: string;
  column: string;
  foreignTable: string;
  foreignColumn: string;
}

export interface CrossTenantReference extends ForeignKey {
  count: number;
}

export async function crossTenantReferences(owner: PrismaClient): Promise<CrossTenantReference[]> {
  const keys = await owner.$queryRaw<ForeignKey[]>`
    SELECT kcu.table_name AS "table", kcu.column_name AS "column",
           ccu.table_name AS "foreignTable", ccu.column_name AS "foreignColumn"
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
      AND ccu.table_name <> 'organizations'
      AND EXISTS (SELECT 1 FROM information_schema.columns c
                  WHERE c.table_schema = 'public' AND c.table_name = kcu.table_name
                    AND c.column_name = 'organization_id')
      AND EXISTS (SELECT 1 FROM information_schema.columns c
                  WHERE c.table_schema = 'public' AND c.table_name = ccu.table_name
                    AND c.column_name = 'organization_id')
    ORDER BY 1, 2`;
  if (keys.length < 20)
    throw new Error(
      `Clés étrangères inter-tables inattendues (${keys.length}) : contrôle suspect.`,
    );

  const crossing: CrossTenantReference[] = [];
  for (const key of keys) {
    const rows = await owner.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*) AS n FROM ${ident(key.table)} t
      JOIN ${ident(key.foreignTable)} f ON f.${ident(key.foreignColumn)} = t.${ident(key.column)}
      WHERE t.organization_id IS DISTINCT FROM f.organization_id
        AND NOT (${key.foreignTable === 'users'} AND f.organization_id =
          (SELECT id FROM organizations WHERE kind = 'PLATFORM'))`;
    const count = Number(rows[0]?.n ?? 0);
    if (count > 0) crossing.push({ ...key, count });
  }
  return crossing;
}
