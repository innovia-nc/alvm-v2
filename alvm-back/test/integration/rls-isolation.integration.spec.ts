/**
 * Isolation des tenants par la Row Level Security — VRAIE base PostgreSQL,
 * rôle applicatif NOSUPERUSER NOBYPASSRLS (CLAUDE.md InnovIA §5.8 / §6.5).
 *
 * Deux associations A et B reçoivent chacune un jeu de données complet écrit
 * par le vrai code. Pour CHAQUE table métier de
 * `packages/shared/prisma/migrations/*_row_level_security`, on vérifie :
 *   - lecture : les lignes de A sont invisibles depuis B, et sans contexte ;
 *   - écriture : B ne peut pas écrire une ligne pour A (WITH CHECK) ;
 *   - UPDATE / DELETE de B sur les lignes de A : sans effet ;
 *   - A ne peut pas « donner » une de ses lignes à B.
 * Puis les tables à policy particulière (organisations, comptes, journal
 * d'audit, réglages de plateforme), le trigger SUPER_ADMIN et l'unicité par
 * tenant.
 *
 * La vue de contrôle (`owner`, superuser) constate l'état réel de la base.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { recordPlatformAudit } from '@back/services/platform-audit.service';
import { getBranding } from '@back/services/platform-config.service';
import { verifyCredentials } from '@back/services/auth.service';
import {
  appPrisma,
  createOwnerClient,
  expectDatabaseError,
  expectRlsViolation,
  expectUniqueViolation,
  ident,
  inAuth,
  inPlatform,
  inTenant,
  rejectionOf,
  tenantRunner,
  toCount,
  trpcCodeOf,
  type ContextRunner,
} from './helpers/db';
import { seedTenantDataset, type TenantDataset } from './helpers/dataset';
import { crossTenantReferences } from './helpers/integrity';
import {
  callerFor,
  createParent,
  createSuperAdmin,
  provisionTenant,
  TEST_PASSWORD,
  uniqueSuffix,
} from './helpers/tenants';

/** Tables à policy `tenant_isolation` stricte (organization_id = tenant courant). */
const TENANT_TABLES = [
  'parents',
  'staff_members',
  'staff_documents',
  'children',
  'children_parents',
  'child_documents',
  'app_settings',
  'camp_types',
  'camps',
  'camp_days',
  'registrations',
  'attendances',
  'invoices',
  'invoice_lines',
  'payment_methods',
  'payments',
  'refunds',
  'accounting_entries',
  'parent_credits',
  'credit_applications',
  'credit_note_allocations',
  'fec_exports',
  'document_counters',
  'email_messages',
] as const;

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../packages/shared/prisma/migrations');

let owner: PrismaClient;
let superAdmin: Awaited<ReturnType<typeof createSuperAdmin>>;
let A: TenantDataset;
let B: TenantDataset;
let orgA: string;
let orgB: string;

beforeAll(async () => {
  owner = createOwnerClient();
  superAdmin = await createSuperAdmin();
  A = await seedTenantDataset(await provisionTenant(superAdmin, 'rls-a'));
  B = await seedTenantDataset(await provisionTenant(superAdmin, 'rls-b'));
  orgA = A.tenant.organization.id;
  orgB = B.tenant.organization.id;
});

afterAll(async () => {
  await owner?.$disconnect();
});

/** Nombre RÉEL de lignes du tenant (vue de contrôle, hors RLS). */
async function ownerCount(table: string, organizationId: string) {
  return toCount(
    await owner.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*) AS n FROM ${ident(table)} WHERE organization_id = ${organizationId}::uuid`,
  );
}

/** Empreinte du contenu des lignes du tenant : toute modification la change. */
async function ownerFingerprint(table: string, organizationId: string) {
  const [row] = await owner.$queryRaw<Array<{ digest: string | null }>>`
    SELECT md5(string_agg(to_jsonb(t)::text, '|' ORDER BY to_jsonb(t)::text)) AS digest
    FROM ${ident(table)} t WHERE organization_id = ${organizationId}::uuid`;
  return row?.digest ?? null;
}

describe('couverture de la campagne', () => {
  it('chaque table sous policy tenant_isolation de la migration est testée ici', () => {
    const migration = readdirSync(MIGRATIONS_DIR).find((dir) =>
      dir.endsWith('_row_level_security'),
    );
    expect(migration, 'migration RLS introuvable').toBeDefined();
    const sql = readFileSync(path.join(MIGRATIONS_DIR, migration!, 'migration.sql'), 'utf8');
    const declared = [...sql.matchAll(/CREATE POLICY tenant_isolation ON "(\w+)"/g)].map(
      (m) => m[1],
    );
    // `users` a aussi une policy tenant_isolation, élargie aux scopes auth/platform (testée à part).
    expect(declared.filter((table) => table !== 'users').sort()).toEqual([...TENANT_TABLES].sort());
  });

  it('toute table portant organization_id est sous RLS et couverte par un test', async () => {
    const tables = await owner.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'organization_id' ORDER BY table_name`;
    expect(tables.map((t) => t.table_name).sort()).toEqual(
      [...TENANT_TABLES, 'users', 'platform_audit_logs'].sort(),
    );
    const policies = await owner.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_policies WHERE schemaname = 'public' AND policyname = 'tenant_isolation'`;
    expect(policies.map((p) => p.tablename).sort()).toEqual([...TENANT_TABLES, 'users'].sort());
  });

  it('le rôle du code testé est soumis à la RLS (ni superuser ni BYPASSRLS)', async () => {
    const [role] = await appPrisma.$queryRaw<Array<{ rolsuper: boolean; rolbypassrls: boolean }>>`
      SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    expect(role).toEqual({ rolsuper: false, rolbypassrls: false });
  });
});

describe.each(TENANT_TABLES)('table %s', (table) => {
  it('le jeu de données a écrit des lignes pour A et pour B (sinon le test ne prouverait rien)', async () => {
    expect(await ownerCount(table, orgA)).toBeGreaterThan(0);
    expect(await ownerCount(table, orgB)).toBeGreaterThan(0);
  });

  it('A voit toutes ses lignes et seulement elles ; B ne voit aucune ligne de A', async () => {
    const expectedA = await ownerCount(table, orgA);
    const expectedB = await ownerCount(table, orgB);
    const seenByA = await inTenant(
      orgA,
      (db) =>
        db.$queryRaw<Array<{ total: bigint; own: bigint }>>`
        SELECT count(*) AS total, count(*) FILTER (WHERE organization_id = ${orgA}::uuid) AS own
        FROM ${ident(table)}`,
    );
    expect(Number(seenByA[0].total)).toBe(expectedA);
    expect(Number(seenByA[0].own)).toBe(expectedA);

    const seenByB = await inTenant(
      orgB,
      (db) =>
        db.$queryRaw<Array<{ total: bigint; fromA: bigint }>>`
        SELECT count(*) AS total, count(*) FILTER (WHERE organization_id = ${orgA}::uuid) AS "fromA"
        FROM ${ident(table)}`,
    );
    expect(Number(seenByB[0].fromA)).toBe(0);
    expect(Number(seenByB[0].total)).toBe(expectedB);
  });

  it('sans contexte, et depuis les scopes platform/auth, aucune ligne métier n’est visible', async () => {
    const count = (rows: Array<{ n: bigint }>) => toCount(rows);
    expect(
      count(
        await appPrisma.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) AS n FROM ${ident(table)}`,
      ),
    ).toBe(0);
    for (const run of [inPlatform, inAuth]) {
      const rows = await run(
        (db) => db.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) AS n FROM ${ident(table)}`,
      );
      expect(count(rows)).toBe(0);
    }
  });

  it('B ne peut pas insérer une ligne pour A (WITH CHECK)', async () => {
    const [source] = await owner.$queryRaw<Array<{ r: Record<string, unknown> }>>`
      SELECT to_jsonb(t) AS r FROM ${ident(table)} t WHERE organization_id = ${orgA}::uuid LIMIT 1`;
    const forged = { ...source.r, ...('id' in source.r ? { id: randomUUID() } : {}) };
    const countBefore = await ownerCount(table, orgA);
    await expectRlsViolation(
      inTenant(
        orgB,
        (db) =>
          db.$executeRaw`INSERT INTO ${ident(table)}
          SELECT * FROM jsonb_populate_record(NULL::${ident(table)}, ${JSON.stringify(forged)}::jsonb)`,
      ),
    );
    expect(await ownerCount(table, orgA)).toBe(countBefore);
  });

  it('UPDATE et DELETE de B sur les lignes de A sont sans effet', async () => {
    const before = await ownerFingerprint(table, orgA);
    const countBefore = await ownerCount(table, orgA);
    const [updated, deleted] = await inTenant(orgB, async (db) => [
      await db.$executeRaw`UPDATE ${ident(table)} SET organization_id = ${orgB}::uuid WHERE organization_id = ${orgA}::uuid`,
      await db.$executeRaw`DELETE FROM ${ident(table)} WHERE organization_id = ${orgA}::uuid`,
    ]);
    expect(updated).toBe(0);
    expect(deleted).toBe(0);
    expect(await ownerCount(table, orgA)).toBe(countBefore);
    expect(await ownerFingerprint(table, orgA)).toBe(before);
  });

  it('A ne peut pas faire passer ses lignes chez B', async () => {
    const before = await ownerFingerprint(table, orgA);
    await expectRlsViolation(
      inTenant(
        orgA,
        (db) =>
          db.$executeRaw`UPDATE ${ident(table)} SET organization_id = ${orgB}::uuid WHERE organization_id = ${orgA}::uuid`,
      ),
    );
    expect(await ownerFingerprint(table, orgA)).toBe(before);
  });
});

describe('accès par le client Prisma (chemin du code applicatif)', () => {
  it('un enfant de A est introuvable, non modifiable et non supprimable depuis B', async () => {
    await inTenant(orgB, async (db) => {
      expect(await db.child.findUnique({ where: { id: A.childId } })).toBeNull();
      expect(await db.child.findFirst({ where: { id: A.childId } })).toBeNull();
      const updated = await db.child.updateMany({
        where: { id: A.childId },
        data: { firstName: 'Piraté' },
      });
      expect(updated.count).toBe(0);
      const deleted = await db.child.deleteMany({ where: { id: A.childId } });
      expect(deleted.count).toBe(0);
    });
    const code = (await rejectionOf(
      inTenant(orgB, (db) =>
        db.child.update({ where: { id: A.childId }, data: { firstName: 'X' } }),
      ),
    )) as { code?: string };
    expect(code.code).toBe('P2025');
    const child = await owner.child.findUniqueOrThrow({ where: { id: A.childId } });
    expect(child.firstName).not.toBe('Piraté');
    expect(child.organizationId).toBe(orgA);
  });

  it('une création dans le contexte de B ne peut pas viser A, même en forçant organizationId', async () => {
    await expectRlsViolation(
      inTenant(orgB, (db) =>
        db.campType.create({ data: { organizationId: orgA, name: `Intrus ${uniqueSuffix()}` } }),
      ),
    );
  });

  it('organization_id est posé par la base depuis le contexte de la transaction', async () => {
    const created = await inTenant(orgB, (db) =>
      db.campType.create({ data: { name: `Défaut ${uniqueSuffix()}` }, select: { id: true } }),
    );
    const row = await owner.campType.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.organizationId).toBe(orgB);
  });

  it('une relation lue en include ne franchit pas la frontière du tenant', async () => {
    // B tente de rattacher un de ses paiements à la facture de A : la FK
    // accepterait l'identifiant, mais la facture reste invisible depuis B.
    const invoice = await inTenant(orgB, (db) =>
      db.payment.findUniqueOrThrow({
        where: { id: B.paymentId },
        select: { invoice: { select: { id: true, organizationId: true } } },
      }),
    );
    expect(invoice.invoice.organizationId).toBe(orgB);
    const foreign = await inTenant(orgB, (db) =>
      db.invoice.findMany({
        where: { id: { in: [A.invoiceId, A.secondInvoiceId, A.creditNoteId] } },
      }),
    );
    expect(foreign).toEqual([]);
  });
});

describe('organizations', () => {
  it('un tenant ne voit que sa propre organisation', async () => {
    const seen = await inTenant(orgA, (db) => db.organization.findMany({ select: { id: true } }));
    expect(seen).toEqual([{ id: orgA }]);
  });

  it('sans contexte : aucune organisation visible', async () => {
    expect(await appPrisma.organization.count()).toBe(0);
  });

  it('les scopes auth (connexion) et platform voient toutes les organisations', async () => {
    for (const run of [inAuth, inPlatform]) {
      const ids = await run((db) =>
        db.organization.findMany({ where: { id: { in: [orgA, orgB] } }, select: { id: true } }),
      );
      expect(ids.map((o) => o.id).sort()).toEqual([orgA, orgB].sort());
    }
  });

  it('un tenant ne peut ni créer, ni renommer, ni supprimer une organisation', async () => {
    await expectRlsViolation(
      inTenant(orgA, (db) =>
        db.organization.create({ data: { slug: `intrus-${uniqueSuffix()}`, name: 'Intrus' } }),
      ),
    );
    const [renamedOwn, renamedOther, deleted] = await inTenant(orgA, async (db) => [
      await db.organization.updateMany({ where: { id: orgA }, data: { name: 'Renommée' } }),
      await db.organization.updateMany({ where: { id: orgB }, data: { name: 'Renommée' } }),
      await db.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } }),
    ]);
    expect([renamedOwn.count, renamedOther.count, deleted.count]).toEqual([0, 0, 0]);
    const names = await owner.organization.findMany({
      where: { id: { in: [orgA, orgB] } },
      select: { name: true },
    });
    expect(names.map((o) => o.name)).not.toContain('Renommée');
  });

  it('le scope auth lit mais n’écrit pas les organisations', async () => {
    const updated = await inAuth((db) =>
      db.organization.updateMany({ where: { id: orgA }, data: { status: 'SUSPENDED' } }),
    );
    expect(updated.count).toBe(0);
    expect((await owner.organization.findUniqueOrThrow({ where: { id: orgA } })).status).toBe(
      'ACTIVE',
    );
  });

  it('seule la plateforme renomme une organisation', async () => {
    const name = `Association renommée ${uniqueSuffix()}`;
    const renamed = await callerFor(superAdmin).organizations.rename({ id: orgB, name });
    expect(renamed.name).toBe(name);
    expect((await owner.organization.findUniqueOrThrow({ where: { id: orgB } })).name).toBe(name);
  });
});

describe('comptes : users, accounts, sessions, verification_tokens', () => {
  it('B ne voit ni les comptes de A, ni leurs identifiants, sessions et jetons', async () => {
    await inTenant(orgB, async (db) => {
      expect(await db.user.findMany({ where: { organizationId: orgA } })).toEqual([]);
      expect(await db.user.findUnique({ where: { id: A.parentId } })).toBeNull();
      expect(await db.account.findMany({ where: { userId: A.parentId } })).toEqual([]);
      expect(await db.session.findMany({ where: { userId: A.parentId } })).toEqual([]);
      expect(
        await db.verificationToken.findMany({ where: { identifier: `password:${A.parentId}` } }),
      ).toEqual([]);
    });
  });

  it('un tenant voit exactement ses comptes', async () => {
    const expected = await owner.user.count({ where: { organizationId: orgA } });
    const seen = await inTenant(orgA, (db) => db.user.count());
    expect(seen).toBe(expected);
    expect(expected).toBeGreaterThanOrEqual(3);
  });

  it('sans contexte : ni compte, ni identifiant, ni jeton visible', async () => {
    expect(await appPrisma.user.count()).toBe(0);
    expect(await appPrisma.account.count()).toBe(0);
    expect(await appPrisma.session.count()).toBe(0);
    expect(await appPrisma.verificationToken.count()).toBe(0);
  });

  it('le scope auth retrouve un compte (et ses identifiants) avant de connaître son tenant', async () => {
    const found = await inAuth((db) =>
      db.user.findFirst({
        where: { organizationId: orgA, email: A.parentEmail },
        select: { id: true, accounts: { select: { provider: true } } },
      }),
    );
    expect(found?.id).toBe(A.parentId);
    expect(found?.accounts.map((a) => a.provider)).toContain('credentials');
    const token = await inAuth((db) =>
      db.verificationToken.findFirst({ where: { identifier: `password:${A.parentId}` } }),
    );
    expect(token).not.toBeNull();
  });

  it('la plateforme voit les comptes de toutes les associations', async () => {
    const count = await inPlatform((db) =>
      db.user.count({ where: { organizationId: { in: [orgA, orgB] } } }),
    );
    expect(count).toBe(await owner.user.count({ where: { organizationId: { in: [orgA, orgB] } } }));
  });

  it('B ne peut pas créer d’identifiant, de session ni de jeton pour un compte de A', async () => {
    await expectRlsViolation(
      inTenant(orgB, (db) =>
        db.account.create({
          data: {
            userId: A.parentId,
            type: 'credentials',
            provider: 'credentials',
            providerAccountId: `vol-${uniqueSuffix()}`,
          },
        }),
      ),
    );
    await expectRlsViolation(
      inTenant(orgB, (db) =>
        db.session.create({
          data: { userId: A.parentId, sessionToken: `vol-${uniqueSuffix()}`, expires: new Date() },
        }),
      ),
    );
    await expectRlsViolation(
      inTenant(orgB, (db) =>
        db.verificationToken.create({
          data: {
            identifier: `password:${A.parentId}`,
            token: `vol-${uniqueSuffix()}`,
            expires: new Date(),
          },
        }),
      ),
    );
  });

  it('B ne peut pas créer de compte dans A (trigger puis WITH CHECK)', async () => {
    // Le trigger BEFORE INSERT lit l'organisation sous la RLS de B : A lui est
    // invisible, il refuse (23503) avant même la policy.
    await expectDatabaseError(
      inTenant(orgB, (db) =>
        db.user.create({
          data: { organizationId: orgA, email: `intrus-${uniqueSuffix()}@x.test`, role: 'ADMIN' },
        }),
      ),
      '23503',
    );
    await expectDatabaseError(
      inTenant(
        orgB,
        (db) =>
          db.$executeRaw`INSERT INTO users (organization_id, email, role)
          VALUES (${orgA}::uuid, ${`intrus-${uniqueSuffix()}@x.test`}, 'PARENT')`,
      ),
      '23503',
      /Organisation inconnue/,
    );
    expect(await owner.user.count({ where: { email: { startsWith: 'intrus-' } } })).toBe(0);
  });

  it('B ne peut ni désactiver ni supprimer un compte de A', async () => {
    const [disabled, deleted, accounts] = await inTenant(orgB, async (db) => [
      await db.user.updateMany({
        where: { id: A.tenant.admin.id },
        data: { disabledAt: new Date() },
      }),
      await db.user.deleteMany({ where: { id: A.parentId } }),
      await db.account.deleteMany({ where: { userId: A.parentId } }),
    ]);
    expect([disabled.count, deleted.count, accounts.count]).toEqual([0, 0, 0]);
    const admin = await owner.user.findUniqueOrThrow({ where: { id: A.tenant.admin.id } });
    expect(admin.disabledAt).toBeNull();
    expect(await owner.account.count({ where: { userId: A.parentId } })).toBeGreaterThan(0);
  });
});

describe('platform_audit_logs : ajout seul, lecture réservée à la plateforme', () => {
  it('le provisionnement a journalisé la création de A (vue de contrôle)', async () => {
    const actions = await owner.platformAuditLog.findMany({
      where: { organizationId: orgA },
      select: { action: true, actorId: true },
    });
    expect(actions).toEqual(
      expect.arrayContaining([
        { action: 'platform.organization.created', actorId: superAdmin.id },
        { action: 'platform.account.created', actorId: superAdmin.id },
      ]),
    );
  });

  it('un tenant (et le scope auth) écrit dans le journal mais ne le lit pas', async () => {
    const action = `test.append.${uniqueSuffix()}`;
    await inTenant(orgA, (db) => recordPlatformAudit(db, A.tenant.admin.id, action, 'cible'));
    await inAuth((db) => recordPlatformAudit(db, null, `${action}.auth`, 'cible', 'FAILED', orgA));
    const rows = await owner.platformAuditLog.findMany({
      where: { action: { startsWith: action } },
      select: { organizationId: true },
    });
    expect(rows).toEqual([{ organizationId: orgA }, { organizationId: orgA }]);
    for (const run of [tenantRunner(orgA), inAuth] as ContextRunner[]) {
      expect(await run((db) => db.platformAuditLog.count())).toBe(0);
    }
    expect(await appPrisma.platformAuditLog.count()).toBe(0);
  });

  it('`create` (INSERT … RETURNING) échoue hors plateforme : seul `createMany` est utilisable', async () => {
    // Garde-fou du piège documenté dans platform-audit.service.ts : RETURNING
    // soumet la ligne insérée à la policy SELECT, réservée à la plateforme.
    await expectRlsViolation(
      inTenant(orgA, (db) =>
        db.platformAuditLog.create({ data: { action: 'test.create', actorId: A.tenant.admin.id } }),
      ),
    );
  });

  it('la plateforme lit le journal de toutes les associations', async () => {
    const count = await inPlatform((db) =>
      db.platformAuditLog.count({ where: { organizationId: { in: [orgA, orgB] } } }),
    );
    expect(count).toBe(
      await owner.platformAuditLog.count({ where: { organizationId: { in: [orgA, orgB] } } }),
    );
    expect(count).toBeGreaterThan(0);
  });

  it('aucun scope ne peut modifier ni effacer le journal', async () => {
    const before = await ownerFingerprint('platform_audit_logs', orgA);
    for (const run of [inPlatform, inAuth, tenantRunner(orgA)] as ContextRunner[]) {
      const [updated, deleted] = await run(async (db) => [
        await db.platformAuditLog.updateMany({ data: { outcome: 'FALSIFIE' } }),
        await db.platformAuditLog.deleteMany({}),
      ]);
      expect([updated.count, deleted.count]).toEqual([0, 0]);
    }
    expect(await ownerFingerprint('platform_audit_logs', orgA)).toBe(before);
  });
});

describe('platform_settings et platform_integrations : lecture libre, écriture plateforme', () => {
  beforeAll(async () => {
    await callerFor(superAdmin).platform.saveBranding({
      name: 'Plateforme intégration',
      description: 'Campagne RLS',
      supportEmail: 'support@plateforme.test',
    });
    await inPlatform((db) =>
      db.platformIntegration.upsert({
        where: { id: 'resend' },
        create: { id: 'resend', enabled: false, updatedBy: superAdmin.id },
        update: { enabled: false },
      }),
    );
  });

  it('lisibles depuis un tenant, le scope auth et sans contexte', async () => {
    expect((await getBranding()).name).toBe('Plateforme intégration');
    for (const run of [tenantRunner(orgA), inAuth] as ContextRunner[]) {
      expect((await run((db) => getBranding(db))).name).toBe('Plateforme intégration');
      expect(await run((db) => db.platformIntegration.count({ where: { id: 'resend' } }))).toBe(1);
    }
    expect(await appPrisma.platformIntegration.count({ where: { id: 'resend' } })).toBe(1);
  });

  it('un tenant ne peut ni créer, ni modifier, ni supprimer un réglage de plateforme', async () => {
    await expectRlsViolation(
      inTenant(orgA, (db) =>
        db.platformSetting.create({ data: { key: `k-${uniqueSuffix()}`, value: 'x' } }),
      ),
    );
    await expectRlsViolation(
      inTenant(orgA, (db) =>
        db.platformIntegration.create({ data: { id: `i-${uniqueSuffix()}` } }),
      ),
    );
    const counts = await inTenant(orgA, async (db) => [
      (await db.platformSetting.updateMany({ data: { value: '{}' } })).count,
      (await db.platformSetting.deleteMany({})).count,
      (await db.platformIntegration.updateMany({ data: { enabled: true } })).count,
      (await db.platformIntegration.deleteMany({})).count,
    ]);
    expect(counts).toEqual([0, 0, 0, 0]);
    expect(
      (await owner.platformSetting.findUniqueOrThrow({ where: { key: 'branding' } })).value,
    ).toContain('Plateforme intégration');
    expect(
      (await owner.platformIntegration.findUniqueOrThrow({ where: { id: 'resend' } })).enabled,
    ).toBe(false);
  });

  it('le scope auth ne peut pas non plus les modifier', async () => {
    const updated = await inAuth((db) => db.platformSetting.updateMany({ data: { value: '{}' } }));
    expect(updated.count).toBe(0);
  });
});

describe('trigger : SUPER_ADMIN seulement dans l’espace PLATFORM', () => {
  it('refuse un SUPER_ADMIN dans une association', async () => {
    await expectDatabaseError(
      inPlatform((db) =>
        db.user.create({
          data: { organizationId: orgA, email: `sa-${uniqueSuffix()}@x.test`, role: 'SUPER_ADMIN' },
        }),
      ),
      '23514',
      /Le rôle SUPER_ADMIN est incompatible avec cet espace/,
    );
  });

  it('refuse un compte métier dans l’espace de plateforme', async () => {
    await expectDatabaseError(
      inPlatform((db) =>
        db.user.create({
          data: {
            organizationId: superAdmin.organizationId,
            email: `admin-${uniqueSuffix()}@x.test`,
            role: 'ADMIN',
          },
        }),
      ),
      '23514',
      /Le rôle ADMIN est incompatible avec cet espace/,
    );
  });

  it('refuse la promotion d’un ADMIN d’association en SUPER_ADMIN', async () => {
    await expectDatabaseError(
      inPlatform((db) =>
        db.user.update({ where: { id: A.tenant.admin.id }, data: { role: 'SUPER_ADMIN' } }),
      ),
      '23514',
      /Le rôle SUPER_ADMIN est incompatible avec cet espace/,
    );
    expect((await owner.user.findUniqueOrThrow({ where: { id: A.tenant.admin.id } })).role).toBe(
      'ADMIN',
    );
  });

  it('un seul espace de plateforme', async () => {
    await expectUniqueViolation(
      inPlatform((db) =>
        db.organization.create({
          data: { slug: `platform-${uniqueSuffix()}`, name: 'Bis', kind: 'PLATFORM' },
        }),
      ),
    );
  });
});

describe('unicité par tenant', () => {
  it('la même adresse existe dans deux associations ; chacune se connecte à la sienne', async () => {
    const email = `homonyme-${uniqueSuffix()}@famille.test`;
    const inA = await createParent(A.tenant, { email });
    const inB = await createParent(B.tenant, { email });
    expect(inA.id).not.toBe(inB.id);

    const loginA = await verifyCredentials(
      {
        portal: 'standard',
        organization: A.tenant.organization.slug,
        email,
        password: TEST_PASSWORD,
      },
      '198.51.100.1',
    );
    const loginB = await verifyCredentials(
      {
        portal: 'standard',
        organization: B.tenant.organization.slug,
        email,
        password: TEST_PASSWORD,
      },
      '198.51.100.1',
    );
    expect(loginA).toMatchObject({ id: inA.id, organizationId: orgA, role: 'PARENT' });
    expect(loginB).toMatchObject({ id: inB.id, organizationId: orgB, role: 'PARENT' });
  });

  it('un doublon d’adresse dans une même association est refusé', async () => {
    expect(
      await trpcCodeOf(
        A.tenant.adminCaller.parents.create({
          firstName: 'Double',
          lastName: 'Compte',
          email: A.parentEmail,
          phone: '687000000',
        }),
      ),
    ).toBe('CONFLICT');
    await expectUniqueViolation(
      inTenant(orgA, (db) => db.user.create({ data: { email: A.parentEmail, role: 'PARENT' } })),
    );
  });

  it('le même numéro de facture existe dans deux associations, jamais deux fois dans une', async () => {
    const [invoiceA, invoiceB] = await Promise.all([
      owner.invoice.findUniqueOrThrow({
        where: { id: A.invoiceId },
        select: { invoiceNumber: true },
      }),
      owner.invoice.findUniqueOrThrow({
        where: { id: B.invoiceId },
        select: { invoiceNumber: true },
      }),
    ]);
    expect(invoiceA.invoiceNumber).toMatch(/^FAC-\d{4}-0001$/);
    expect(invoiceB.invoiceNumber).toBe(invoiceA.invoiceNumber);

    await expectUniqueViolation(
      inTenant(orgA, (db) =>
        db.invoice.create({
          data: {
            invoiceNumber: invoiceA.invoiceNumber,
            parentId: A.parentId,
            dueDate: new Date(),
            totalAmount: 1,
          },
        }),
      ),
    );
  });
});

describe('intégrité inter-tenants', () => {
  it('aucune ligne de A ne référence une ligne de B (clés étrangères vérifiées hors RLS)', async () => {
    expect(await crossTenantReferences(owner)).toEqual([]);
  });
});
