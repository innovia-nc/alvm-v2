/**
 * Échappe une chaîne destinée à un contenu HTML (corps d'email, DOM hors JSX).
 *
 * Les données injectées viennent de la base (nom du client, numéro de pièce,
 * nom de l'association) : saisies par des humains, elles peuvent contenir
 * `&`, `<`, `"`… qui casseraient le rendu ou injecteraient du balisage
 * (CLAUDE.md InnovIA §5.13).
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
