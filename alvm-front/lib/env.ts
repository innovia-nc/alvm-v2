/**
 * Variables d'environnement du front, validées au démarrage
 * (`instrumentation.ts`, CLAUDE.md InnovIA §5.10 / §5.13). Serveur uniquement :
 * aucune variable `NEXT_PUBLIC_*` — le navigateur ne parle qu'au front.
 *
 * La validation est sautée pendant `next build` (phase de build de Next, ou
 * `SKIP_ENV_VALIDATION=1`) : les pages sont dynamiques, les secrets ne sont lus
 * qu'à l'exécution — le build (image Docker, CI) ne dépend d'aucun secret. Au
 * démarrage du serveur, `instrumentation.ts` valide et arrête le processus si
 * la configuration est invalide.
 */
import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  server: {
    /** Secret NextAuth : chiffre le cookie de session (partagé avec le back). */
    AUTH_SECRET: z.string().min(32),
    /** URL publique du front, sans slash final. */
    AUTH_URL: z.string().url().optional(),
    /** Back NestJS sur le réseau interne (ex. http://alvm-back:4001). */
    API_INTERNAL_URL: z.string().url(),
    /** Secret partagé front ↔ back. */
    INTERNAL_API_SECRET: z.string().min(32),
    /** Relais de confiance devant le front (Traefik : 1 ; Cloudflare + Traefik : 2). */
    TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).optional(),
  },
  experimental__runtimeEnv: {},
  emptyStringAsUndefined: true,
  skipValidation:
    Boolean(process.env.SKIP_ENV_VALIDATION) ||
    process.env.NEXT_PHASE === 'phase-production-build',
});
