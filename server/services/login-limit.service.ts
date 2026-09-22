import { createHash } from 'node:crypto';
import { prisma } from '@/server/db';

// Fixed windows shared by every instance. Passwords and raw IPs are never stored.
export async function consumeLoginAttempt(email: string, headers: Headers): Promise<boolean> {
  const origin = process.env.VERCEL
    ? (headers.get('x-vercel-forwarded-for') ?? 'unknown')
    : 'local';
  const keys = [`account:${email.trim().toLowerCase()}`, `origin:${origin}`];
  const allowed = await Promise.all(
    keys.map(async (key, index) => {
      const digest = createHash('sha256').update(key).digest('hex');
      const rows = await prisma.$queryRawUnsafe<Array<{ attempts: number }>>(
        `INSERT INTO login_attempts (key, window_start, attempts) VALUES ($1, NOW(), 1)
       ON CONFLICT (key) DO UPDATE SET
       attempts = CASE WHEN login_attempts.window_start < NOW() - INTERVAL '15 minutes' THEN 1 ELSE login_attempts.attempts + 1 END,
       window_start = CASE WHEN login_attempts.window_start < NOW() - INTERVAL '15 minutes' THEN NOW() ELSE login_attempts.window_start END
       RETURNING attempts`,
        digest,
      );
      return rows[0].attempts <= (index === 0 ? 10 : 100);
    }),
  );
  return allowed.every(Boolean);
}
