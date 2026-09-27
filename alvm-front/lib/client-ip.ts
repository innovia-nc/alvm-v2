/**
 * Adresse du client, pour la limitation de débit des connexions. Calculée par
 * le front (qui connaît les relais devant lui) et transmise au back dans
 * l'en-tête interne `x-alvm-client-ip`.
 *
 * Derrière Traefik (Coolify), éventuellement précédé de Cloudflare, on lit
 * `X-Forwarded-For` EN PARTANT DE LA FIN : chaque relais ajoute l'adresse qu'il
 * voit, le premier élément est fourni par le client et donc forgeable.
 * `TRUSTED_PROXY_HOPS` = nombre de relais de confiance devant l'application
 * (Traefik seul : 1 ; Cloudflare + Traefik : 2). À 0 ou absent, l'en-tête
 * n'est pas lu : toutes les requêtes partagent le seau `local`.
 */
export function getClientIp(
  headers: Headers,
  env: Record<string, string | undefined> = process.env,
): string {
  const hops = Number.parseInt(env.TRUSTED_PROXY_HOPS ?? '0', 10);
  if (!Number.isInteger(hops) || hops <= 0) return 'local';

  const chain = (headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  // Moins d'éléments que de relais annoncés : la chaîne n'est pas celle
  // attendue (requête arrivée sans passer par tous les relais).
  if (chain.length < hops) return 'unknown';
  return chain[chain.length - hops];
}
