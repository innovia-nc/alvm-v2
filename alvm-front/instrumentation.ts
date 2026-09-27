/**
 * Démarrage du serveur Next : valide l'environnement AVANT de servir
 * (fail-closed, CLAUDE.md InnovIA §5.13). Une variable manquante arrête le
 * processus au lieu de produire des erreurs à la première requête.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  try {
    await import('./lib/env');
  } catch (error) {
    // Next journaliserait l'erreur et continuerait à répondre 500 partout :
    // on arrête le processus pour que l'orchestrateur voie l'échec.
    console.error('[alvm-front] configuration invalide —', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
