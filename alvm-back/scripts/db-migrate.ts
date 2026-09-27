/**
 * Applique les migrations Prisma puis accorde au rôle applicatif les droits
 * dont il a besoin — et seulement ceux-là.
 *
 * Deux connexions (docs/adr/0002-multi-tenant-rls.md) :
 *   DATABASE_MIGRATION_URL — propriétaire du schéma : `prisma migrate deploy`, GRANT
 *   DATABASE_URL           — rôle applicatif : son nom reçoit les droits DML
 *
 * Refuse de continuer si le rôle applicatif est superuser ou BYPASSRLS : la
 * RLS ne s'appliquerait pas et l'isolation des tenants serait un leurre.
 *
 * Image Docker : `docker run <image-back> migrate`. Poste de dev : `pnpm db:migrate` (racine).
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

/**
 * Schéma : source unique `packages/shared/prisma` (monorepo) ; l'image Docker
 * le copie dans `./prisma` (PRISMA_SCHEMA la surcharge).
 */
const schema =
  process.env.PRISMA_SCHEMA ??
  [
    path.resolve(process.cwd(), '../packages/shared/prisma/schema.prisma'),
    path.resolve(process.cwd(), 'prisma/schema.prisma'),
  ].find((candidate) => existsSync(candidate)) ??
  'prisma/schema.prisma';
const prismaBin = process.env.PRISMA_BIN ?? 'prisma';

function requireUrl(name: 'DATABASE_URL' | 'DATABASE_MIGRATION_URL'): URL {
  const raw = process.env[name];
  if (!raw) throw new Error(`${name} est requis.`);
  try {
    return new URL(raw);
  } catch {
    throw new Error(`${name} n'est pas une URL PostgreSQL valide.`);
  }
}

async function main() {
  const appUrl = requireUrl('DATABASE_URL');
  const migrationUrl = requireUrl('DATABASE_MIGRATION_URL');
  const appRole = decodeURIComponent(appUrl.username);
  if (!appRole) throw new Error('DATABASE_URL doit nommer le rôle applicatif.');
  if (appRole === decodeURIComponent(migrationUrl.username))
    throw new Error(
      'DATABASE_URL et DATABASE_MIGRATION_URL utilisent le même rôle : le rôle applicatif doit être distinct du propriétaire du schéma.',
    );

  console.log('[db-migrate] prisma migrate deploy…');
  execFileSync(prismaBin, ['migrate', 'deploy', '--schema', schema], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: migrationUrl.toString() },
  });

  const owner = new PrismaClient({ datasourceUrl: migrationUrl.toString() });
  try {
    const [role] = await owner.$queryRaw<
      Array<{ rolsuper: boolean; rolbypassrls: boolean }>
    >`SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = ${appRole}`;
    if (!role) throw new Error(`Le rôle applicatif « ${appRole} » n'existe pas.`);
    if (role.rolsuper || role.rolbypassrls)
      throw new Error(
        `Le rôle applicatif « ${appRole} » est superuser ou BYPASSRLS : la RLS ne s'appliquerait pas.`,
      );

    console.log(`[db-migrate] Droits du rôle applicatif « ${appRole} »…`);
    // Le nom du rôle passe par une GUC transactionnelle puis `format('%I')` :
    // jamais concaténé dans le SQL.
    await owner.$transaction([
      owner.$executeRaw`SELECT set_config('alvm.app_role', ${appRole}, true)`,
      owner.$executeRaw`DO $$
        DECLARE r text := current_setting('alvm.app_role');
        BEGIN
          EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', r);
          EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', r);
          EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', r);
          EXECUTE format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO %I', r);
          EXECUTE format('REVOKE ALL ON TABLE _prisma_migrations FROM %I', r);
        END $$`,
    ]);
    console.log('[db-migrate] Terminé.');
  } finally {
    await owner.$disconnect();
  }
}

main().catch((error) => {
  console.error(`[db-migrate] ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
