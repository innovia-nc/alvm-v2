import { createHash } from 'node:crypto';
import { prisma } from '@/server/db';
import { getClientIp } from '@/server/helpers/client-ip';

/**
 * Limitation de débit des connexions et demandes de réinitialisation.
 *
 * Fenêtres fixes de 15 minutes partagées par toutes les instances. Ni mot de
 * passe ni IP en clair : seules des empreintes SHA-256 sont stockées.
 * `login_attempts` n'a pas de tenant : la table est hors RLS et se lit avec le
 * client racine.
 *
 * @param account clé du compte visé, préfixée par l'espace (`alvm:jean@…`).
 */
export async function consumeLoginAttempt(account: string, headers: Headers): Promise<boolean> {
  const origin = getClientIp(headers);
  const keys = [`account:${account.trim().toLowerCase()}`, `origin:${origin}`];
  const allowed = await Promise.all(
    keys.map(async (key, index) => {
      const digest = createHash('sha256').update(key).digest('hex');
      const rows = await prisma.$queryRaw<Array<{ attempts: number }>>`
        INSERT INTO login_attempts (key, window_start, attempts) VALUES (${digest}, NOW(), 1)
        ON CONFLICT (key) DO UPDATE SET
          attempts = CASE WHEN login_attempts.window_start < NOW() - INTERVAL '15 minutes' THEN 1 ELSE login_attempts.attempts + 1 END,
          window_start = CASE WHEN login_attempts.window_start < NOW() - INTERVAL '15 minutes' THEN NOW() ELSE login_attempts.window_start END
        RETURNING attempts`;
      return rows[0].attempts <= (index === 0 ? 10 : 100);
    }),
  );
  return allowed.every(Boolean);
}
