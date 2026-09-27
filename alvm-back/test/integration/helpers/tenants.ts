/**
 * Fabriques des tests d'intégration : espaces (tenants), comptes, familles,
 * camps — TOUJOURS par le vrai code applicatif (provisionnement de la super
 * administration, procédures tRPC), jamais par des INSERT de complaisance :
 * une fabrique qui contournerait la RLS masquerait précisément les défauts
 * que cette campagne doit attraper.
 */
import { randomBytes } from 'node:crypto';
import { hash } from 'bcryptjs';
import { prisma } from '@back/db';
import { withDbContext } from '@back/db-context';
import {
  provisionOrganization,
  provisionOrganizationSchema,
} from '@back/services/organization.service';
import { appRouter } from '@back/trpc/trpc.router';
import type { AuthUser } from '@back/trpc/trpc.context';

/** Mot de passe de tous les comptes de test (politique « forte » : 12+, Aa1). */
export const TEST_PASSWORD = 'Integration2026Pass';

/** Suffixe unique : les fichiers de test partagent la base. */
export function uniqueSuffix(): string {
  return randomBytes(4).toString('hex');
}

/** Caller tRPC RÉEL : transaction de contexte RLS, client applicatif, vraie base. */
export function callerFor(user: AuthUser | null, clientIp = '127.0.0.1') {
  return appRouter.createCaller({ user, prisma, withDb: withDbContext, clientIp });
}

export type Caller = ReturnType<typeof callerFor>;

/**
 * Espace de plateforme (créé au besoin) et un nouveau compte SUPER_ADMIN —
 * même chemin que `scripts/create-super-admin.ts`.
 */
export async function createSuperAdmin(): Promise<AuthUser & { email: string }> {
  const email = `superadmin-${uniqueSuffix()}@plateforme.test`;
  const passwordHash = await hash(TEST_PASSWORD, 4);
  return withDbContext({ scope: 'platform' }, async (db) => {
    const platform =
      (await db.organization.findFirst({ where: { kind: 'PLATFORM' }, select: { id: true } })) ??
      (await db.organization.create({
        data: { slug: 'platform', name: 'Plateforme de test', kind: 'PLATFORM' },
        select: { id: true },
      }));
    const user = await db.user.create({
      data: {
        organizationId: platform.id,
        email,
        name: 'Super administrateur de test',
        role: 'SUPER_ADMIN',
        emailVerified: new Date(),
        accounts: {
          create: { type: 'credentials', provider: 'credentials', providerAccountId: passwordHash },
        },
      },
      select: { id: true },
    });
    return { id: user.id, role: 'SUPER_ADMIN' as const, organizationId: platform.id, email };
  });
}

export interface TestTenant {
  organization: { id: string; slug: string; name: string };
  admin: AuthUser & { email: string };
  /** Caller tRPC de l'ADMIN de l'association. */
  adminCaller: Caller;
}

/**
 * Crée une association par le provisionnement de la super administration
 * (`provisionOrganization`, scope `platform`) : données de référence
 * (moyens de paiement système, tarification) et premier compte ADMIN.
 */
export async function provisionTenant(superAdmin: AuthUser, label: string): Promise<TestTenant> {
  const slug = `it-${label}-${uniqueSuffix()}`.toLowerCase().slice(0, 40);
  const input = provisionOrganizationSchema.parse({
    name: `Association ${label}`,
    slug,
    admin: { name: `Admin ${label}`, email: `admin@${slug}.test`, password: TEST_PASSWORD },
  });
  const organization = await withDbContext({ scope: 'platform' }, (db) =>
    provisionOrganization(db, input, superAdmin.id),
  );
  const adminRow = await withDbContext({ scope: 'tenant', organizationId: organization.id }, (db) =>
    db.user.findFirstOrThrow({
      where: { role: 'ADMIN', email: input.admin.email },
      select: { id: true },
    }),
  );
  const admin = {
    id: adminRow.id,
    role: 'ADMIN' as const,
    organizationId: organization.id,
    email: input.admin.email,
  };
  return {
    organization: { id: organization.id, slug: organization.slug, name: organization.name },
    admin,
    adminCaller: callerFor(admin),
  };
}

export interface TestParent extends AuthUser {
  email: string;
  caller: Caller;
}

/** Parent (client) créé par le personnel, avec mot de passe (connexion possible). */
export async function createParent(
  tenant: TestTenant,
  overrides: { email?: string; firstName?: string; lastName?: string } = {},
): Promise<TestParent> {
  const email = overrides.email ?? `parent-${uniqueSuffix()}@famille.test`;
  const parent = await tenant.adminCaller.parents.create({
    firstName: overrides.firstName ?? 'Camille',
    lastName: overrides.lastName ?? 'Famille',
    email,
    phone: '687123456',
    postalCode: '98800',
    password: TEST_PASSWORD,
  });
  const user = { id: parent.id, role: 'PARENT' as const, organizationId: tenant.organization.id };
  return { ...user, email, caller: callerFor(user) };
}

/** Membre du personnel (compte STAFF + fiche). */
export async function createStaff(tenant: TestTenant) {
  const email = `staff-${uniqueSuffix()}@equipe.test`;
  const staff = await tenant.adminCaller.staff.create({
    firstName: 'Dominique',
    lastName: 'Animateur',
    email,
    password: TEST_PASSWORD,
  });
  const user = { id: staff.id, role: 'STAFF' as const, organizationId: tenant.organization.id };
  return { ...user, email, caller: callerFor(user) };
}

/** Enfant rattaché à un parent principal. */
export async function createChild(tenant: TestTenant, parentId: string, firstName = 'Lou') {
  return tenant.adminCaller.children.create({
    firstName,
    lastName: 'Famille',
    birthDate: '2016-05-10T00:00:00.000Z',
    gender: 'FEMALE',
    parents: [{ parentId, isPrimary: true, relationship: 'mother' }],
  });
}

/** Date `YYYY-MM-DD` à `days` jours d'aujourd'hui. */
export function isoDay(days: number): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Type d'ACM de chaque association de test (code comptable 706100, unique par tenant). */
const campTypes = new Map<string, Promise<{ id: string }>>();

/**
 * Camp publié de 5 jours, dans 30 jours, à 25 000 XPF (5 000 XPF / jour) —
 * les montants de l'ancienne campagne smoke. Le type d'ACM (compte de vente
 * 706100) est créé au premier camp de l'association.
 */
export async function createPublishedCamp(
  tenant: TestTenant,
  overrides: { maxCapacity?: number; totalPrice?: number } = {},
) {
  const organizationId = tenant.organization.id;
  if (!campTypes.has(organizationId))
    campTypes.set(
      organizationId,
      tenant.adminCaller.campTypes.create({ name: 'Séjour', accountingCode: '706100' }),
    );
  const campType = await campTypes.get(organizationId)!;
  const camp = await tenant.adminCaller.camps.create({
    name: `Camp ${uniqueSuffix()}`,
    description: 'Camp de la campagne d’intégration',
    campTypeId: campType.id,
    location: 'Nouméa',
    maxCapacity: overrides.maxCapacity ?? 10,
    startDate: isoDay(30),
    endDate: isoDay(34),
    registrationDeadline: isoDay(20),
    totalPrice: overrides.totalPrice ?? 25000,
    status: 'PUBLISHED',
  });
  return { campType, camp };
}
