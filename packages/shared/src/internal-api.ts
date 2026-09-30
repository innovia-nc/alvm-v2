/**
 * Contrat HTTP interne front → back (réseau Docker, jamais public).
 * Voir docs/adr/0001-monorepo-nestjs.md.
 */

/** Secret partagé prouvant que la requête vient du front. */
export const INTERNAL_SECRET_HEADER = 'x-internal-secret';

/** Adresse du client, calculée par le front qui connaît les relais de confiance. */
export const CLIENT_IP_HEADER = 'x-alvm-client-ip';

/** Préfixes d'API servis par le back et relayés par le front (`/api/<préfixe>/…`). */
export const BACK_API_PREFIXES = ['trpc', 'documents', 'generate', 'upload'] as const;
