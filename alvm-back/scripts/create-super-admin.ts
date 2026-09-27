/**
 * Amorçage d'une plateforme neuve : crée l'espace de plateforme (s'il manque)
 * et un compte SUPER_ADMIN. Ne promeut ni ne réinitialise jamais un compte
 * existant. Les associations se créent ensuite depuis la super administration.
 *
 * Image Docker : `./docker-entrypoint.sh create-super-admin`.
 */
import { hash } from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@back/db';
import { withDbContext } from '@back/db-context';
import { BCRYPT_ROUNDS } from '@back/helpers/password';
import { recordPlatformAudit } from '@back/services/platform-audit.service';

const config = z
  .object({
    SUPER_ADMIN_EMAIL: z.string().email().toLowerCase(),
    SUPER_ADMIN_NAME: z.string().min(2).default('Super administrateur'),
    SUPER_ADMIN_PASSWORD: z.string().min(12).max(128).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/),
    PLATFORM_NAME: z.string().trim().min(2).max(120).default('Plateforme'),
  })
  .safeParse(process.env);

async function main() {
  if (!config.success)
    throw new Error(
      'Renseignez SUPER_ADMIN_EMAIL et SUPER_ADMIN_PASSWORD (12 caractères minimum, majuscule, minuscule, chiffre).',
    );
  const { SUPER_ADMIN_EMAIL: email, SUPER_ADMIN_NAME: name, PLATFORM_NAME } = config.data;
  const passwordHash = await hash(config.data.SUPER_ADMIN_PASSWORD, BCRYPT_ROUNDS);

  await withDbContext({ scope: 'platform' }, async (db) => {
    const platform =
      (await db.organization.findFirst({ where: { kind: 'PLATFORM' }, select: { id: true } })) ??
      (await db.organization.create({
        data: { slug: 'platform', name: PLATFORM_NAME, kind: 'PLATFORM' },
        select: { id: true },
      }));
    if (await db.user.findFirst({ where: { organizationId: platform.id, email } }))
      throw new Error('Cette adresse possède déjà un compte. Utilisez une adresse dédiée.');
    const user = await db.user.create({
      data: {
        organizationId: platform.id,
        email,
        name,
        role: 'SUPER_ADMIN',
        emailVerified: new Date(),
        accounts: {
          create: { type: 'credentials', provider: 'credentials', providerAccountId: passwordHash },
        },
      },
      select: { id: true },
    });
    await recordPlatformAudit(
      db,
      null,
      'platform.account.created',
      user.id,
      'SUCCESS',
      platform.id,
    );
  });
  console.log('Compte super administrateur créé. Connexion : /auth/super-admin');
}

main()
  .catch((error) => {
    console.error(
      error instanceof Error && !('code' in error)
        ? error.message
        : 'Création impossible. Vérifiez les migrations (db:migrate) et la disponibilité de la base.',
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
