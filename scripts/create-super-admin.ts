/** Explicit provisioning only: never promotes or resets an existing account. */
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { z } from 'zod';

const config = z
  .object({
    SUPER_ADMIN_EMAIL: z.string().email().toLowerCase(),
    SUPER_ADMIN_NAME: z.string().min(2).default('Super administrateur'),
    SUPER_ADMIN_PASSWORD: z.string().min(12).max(128).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/),
  })
  .safeParse(process.env);

async function main() {
  if (!config.success)
    throw new Error(
      'Renseignez SUPER_ADMIN_EMAIL et SUPER_ADMIN_PASSWORD (12 caractères minimum, majuscule, minuscule, chiffre).',
    );
  const {
    SUPER_ADMIN_EMAIL: email,
    SUPER_ADMIN_NAME: name,
    SUPER_ADMIN_PASSWORD: password,
  } = config.data;
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing)
      throw new Error('Cette adresse possède déjà un compte. Utilisez une adresse dédiée.');
    await prisma.user.create({
      data: {
        email,
        name,
        role: 'SUPER_ADMIN',
        emailVerified: new Date(),
        accounts: {
          create: {
            type: 'credentials',
            provider: 'credentials',
            providerAccountId: await hash(password, 12),
          },
        },
      },
    });
    console.log('Compte super administrateur créé. Connexion : /auth/super-admin');
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error && !('code' in error)
      ? error.message
      : 'Création impossible. Vérifiez la migration et la disponibilité de la base.',
  );
  process.exitCode = 1;
});
