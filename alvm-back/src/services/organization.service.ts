/**
 * Cycle de vie des associations (tenants) — super administration.
 *
 * Toutes les fonctions s'exécutent dans une transaction de scope `platform` ;
 * les écritures métier du provisionnement basculent explicitement sur le
 * nouveau tenant (`actAsOrganization`), la RLS vérifiant chaque ligne.
 */
import { TRPCError } from '@trpc/server';
import { Prisma } from '@prisma/client';
import { hash } from 'bcryptjs';
import { z } from 'zod';
import { actAsOrganization, withDbContext, type Db } from '@back/db-context';
import { BCRYPT_ROUNDS } from '@back/helpers/password';
import { parseLogoValue } from '@back/helpers/settings';
import { organizationSlugSchema } from '@back/services/auth.service';
import { recordPlatformAudit } from '@back/services/platform-audit.service';
import { ensureTenantDefaults } from '@back/services/tenant-defaults';

/** Identifiants réservés : routes et espaces techniques. */
const RESERVED_SLUGS = new Set(['platform', 'admin', 'api', 'auth', 'dashboard', 'www', 'app']);

export const tenantSlugSchema = organizationSlugSchema.refine(
  (slug) => !RESERVED_SLUGS.has(slug),
  'Cet identifiant est réservé',
);

export const strongPasswordSchema = z
  .string()
  .min(12)
  .max(128)
  .regex(/[A-Z]/)
  .regex(/[a-z]/)
  .regex(/[0-9]/);

export const provisionOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: tenantSlugSchema,
  admin: z.object({
    name: z.string().trim().min(2).max(100),
    email: z.string().email().toLowerCase(),
    password: strongPasswordSchema,
  }),
});

export const organizationSelect = {
  id: true,
  slug: true,
  name: true,
  status: true,
  suspendedAt: true,
  createdAt: true,
} as const;

/** Refuse toute cible qui n'est pas une association (l'espace plateforme est intouchable). */
export async function assertTenantOrganization(db: Db, organizationId: string) {
  const found = await db.organization.findUnique({
    where: { id: organizationId },
    select: { ...organizationSelect, kind: true },
  });
  if (!found) throw new TRPCError({ code: 'NOT_FOUND', message: 'Association introuvable.' });
  const { kind, ...organization } = found;
  if (kind !== 'TENANT')
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'L’espace de plateforme n’est pas modifiable ici.',
    });
  return organization;
}

/**
 * Crée une association, ses données de référence et son premier compte ADMIN.
 * Atomique : un slug déjà pris ou un mot de passe refusé n'écrit rien.
 */
export async function provisionOrganization(
  db: Db,
  input: z.infer<typeof provisionOrganizationSchema>,
  actorId: string,
) {
  const passwordHash = await hash(input.admin.password, BCRYPT_ROUNDS);
  let organization;
  try {
    organization = await db.organization.create({
      data: { name: input.name, slug: input.slug, kind: 'TENANT' },
      select: organizationSelect,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'Cet identifiant d’espace est déjà utilisé.',
      });
    throw error;
  }

  await actAsOrganization(db, organization.id);
  await ensureTenantDefaults(db, organization.id, organization.name);
  const admin = await db.user.create({
    data: {
      name: input.admin.name,
      email: input.admin.email,
      role: 'ADMIN',
      emailVerified: new Date(),
      accounts: {
        create: { type: 'credentials', provider: 'credentials', providerAccountId: passwordHash },
      },
    },
    select: { id: true },
  });
  await recordPlatformAudit(db, actorId, 'platform.organization.created', organization.id);
  await recordPlatformAudit(db, actorId, 'platform.account.created', admin.id);
  await actAsOrganization(db, null);
  return organization;
}

/** Nom et logo d'une association active, pour l'écran de connexion. */
export async function getPublicOrganization(slug: string) {
  const parsed = organizationSlugSchema.safeParse(slug);
  if (!parsed.success) return null;
  const organization = await withDbContext({ scope: 'auth' }, (db) =>
    db.organization.findFirst({
      where: { slug: parsed.data, kind: 'TENANT', status: 'ACTIVE' },
      select: { id: true, slug: true, name: true },
    }),
  );
  if (!organization) return null;
  const logo = await withDbContext({ scope: 'tenant', organizationId: organization.id }, (db) =>
    db.appSetting.findFirst({
      where: { category: 'organization', key: 'logo_url' },
      select: { value: true },
    }),
  );
  return {
    slug: organization.slug,
    name: organization.name,
    logoUrl: parseLogoValue(logo?.value) ?? null,
  };
}
