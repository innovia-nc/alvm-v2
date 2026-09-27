/**
 * Variables d'environnement du back, validées au démarrage (CLAUDE.md InnovIA
 * §5.10 / §5.13). Un secret critique absent ou non conforme FAIT ÉCHOUER le
 * boot : jamais de valeur par défaut permissive (fail-closed).
 */
import { z } from 'zod';

const base64Key32 = z
  .string()
  .refine(
    (value) => Buffer.from(value, 'base64').length === 32,
    'clé de 32 octets encodée en base64 attendue',
  );

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4001),
    /** Rôle applicatif NOSUPERUSER NOBYPASSRLS (vérifié au boot). */
    DATABASE_URL: z.string().url(),
    /** Secret NextAuth partagé avec le front : déchiffre le cookie de session. */
    AUTH_SECRET: z.string().min(32, 'AUTH_SECRET doit faire au moins 32 caractères'),
    /** Secret partagé front ↔ back : seul le front parle au back. */
    INTERNAL_API_SECRET: z
      .string()
      .min(32, 'INTERNAL_API_SECRET doit faire au moins 32 caractères'),
    /** URL publique du front (liens des emails de réinitialisation). */
    AUTH_URL: z.string().url().optional(),
    PLATFORM_ENCRYPTION_KEY: base64Key32.optional(),
    /** File d'emails BullMQ (alvm-email). */
    REDIS_URL: z.string().url().optional(),
    EMAIL_FROM_ADDRESS: z.string().email().optional(),
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV !== 'production') return;
    for (const key of ['AUTH_URL', 'PLATFORM_ENCRYPTION_KEY', 'REDIS_URL'] as const)
      if (!env[key])
        context.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} est requis en production`,
        });
  });

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Lit et valide l'environnement (une fois). Lève une erreur lisible sinon. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached && source === process.env) return cached;
  const parsed = schema.safeParse(
    Object.fromEntries(
      Object.entries(source).map(([key, value]) => [key, value === '' ? undefined : value]),
    ),
  );
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuration invalide :\n${details}`);
  }
  if (source === process.env) cached = parsed.data;
  return parsed.data;
}
