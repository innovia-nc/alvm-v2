/**
 * Authentification multi-tenant (scope RLS `auth`).
 *
 * Un compte est identifié par (espace, email) : la même adresse peut exister
 * dans deux associations sans que l'une apprenne l'existence de l'autre. Les
 * SUPER_ADMIN vivent dans l'espace de plateforme et se connectent par
 * `/auth/super-admin`, sans identifiant d'espace.
 */
import { compare } from 'bcryptjs';
import { z } from 'zod';
import type { Db } from '@back/db-context';
import { withDbContext } from '@back/db-context';
import { recordPlatformAudit } from '@back/services/platform-audit.service';
import { consumeLoginAttempt } from '@back/services/login-limit.service';
import type { UserRole } from '@back/trpc/trpc.context';
import { ORGANIZATION_SLUG_PATTERN } from '@alvm/shared/organization-slug';

export const organizationSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(ORGANIZATION_SLUG_PATTERN, 'Identifiant d’espace invalide');

export const signInSchema = z.discriminatedUnion('portal', [
  z.object({
    portal: z.literal('standard'),
    organization: organizationSlugSchema,
    email: z.string().email().toLowerCase(),
    password: z.string().min(1).max(128),
  }),
  z.object({
    portal: z.literal('super-admin'),
    email: z.string().email().toLowerCase(),
    password: z.string().min(1).max(128),
  }),
]);

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  role: UserRole;
  organizationId: string;
  sessionVersion: number;
}

/** Espace ciblé par une connexion : tenant actif par son slug, ou la plateforme. */
async function findLoginOrganization(
  db: Db,
  credentials: z.infer<typeof signInSchema>,
): Promise<{ id: string } | null> {
  return credentials.portal === 'super-admin'
    ? db.organization.findFirst({ where: { kind: 'PLATFORM' }, select: { id: true } })
    : db.organization.findFirst({
        where: { slug: credentials.organization, kind: 'TENANT', status: 'ACTIVE' },
        select: { id: true },
      });
}

/**
 * Vérifie des identifiants. Renvoie `null` pour TOUT refus (espace inconnu ou
 * suspendu, compte inconnu ou désactivé, mauvais portail, mot de passe
 * erroné, quota dépassé) : l'appelant ne peut pas distinguer les cas.
 */
export async function verifyCredentials(
  input: unknown,
  clientIp: string,
): Promise<AuthenticatedUser | null> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return null;
  const credentials = parsed.data;
  const space = credentials.portal === 'super-admin' ? 'platform' : credentials.organization;
  if (!(await consumeLoginAttempt(`${space}:${credentials.email}`, clientIp))) return null;

  return withDbContext({ scope: 'auth' }, async (db) => {
    const organization = await findLoginOrganization(db, credentials);
    if (!organization) return null;

    const user = await db.user.findFirst({
      where: { organizationId: organization.id, email: credentials.email },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        role: true,
        organizationId: true,
        sessionVersion: true,
        disabledAt: true,
        accounts: { where: { provider: 'credentials' }, select: { providerAccountId: true } },
      },
    });
    if (!user || user.disabledAt || user.accounts.length === 0) return null;
    if ((user.role === 'SUPER_ADMIN') !== (credentials.portal === 'super-admin')) return null;

    const valid = await compare(credentials.password, user.accounts[0].providerAccountId);
    await recordPlatformAudit(
      db,
      valid ? user.id : null,
      valid ? 'auth.login' : 'auth.login_failed',
      valid ? user.role : user.id,
      valid ? 'SUCCESS' : 'FAILED',
      user.organizationId,
    );
    if (!valid) return null;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      role: user.role,
      organizationId: user.organizationId,
      sessionVersion: user.sessionVersion,
    };
  });
}

/**
 * Une session JWT reste valable tant que le compte existe, est actif, garde
 * le même rôle et la même version de session, et que son espace est actif.
 * Appelée à chaque résolution de session (révocation immédiate).
 */
export async function isSessionValid(token: {
  id: string;
  role: UserRole;
  organizationId: string;
  sessionVersion: number;
}): Promise<boolean> {
  return withDbContext({ scope: 'auth' }, async (db) => {
    const current = await db.user.findUnique({
      where: { id: token.id },
      select: {
        disabledAt: true,
        sessionVersion: true,
        role: true,
        organizationId: true,
        organization: { select: { status: true } },
      },
    });
    return Boolean(
      current &&
      !current.disabledAt &&
      current.sessionVersion === token.sessionVersion &&
      current.role === token.role &&
      current.organizationId === token.organizationId &&
      current.organization.status === 'ACTIVE',
    );
  });
}
