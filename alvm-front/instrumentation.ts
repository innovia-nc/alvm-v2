/**
 * Démarrage du serveur Next : valide l'environnement AVANT de servir
 * (fail-closed, CLAUDE.md InnovIA §5.13). Une variable manquante arrête le
 * processus au lieu de produire des erreurs à la première requête.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('./lib/env');
}
