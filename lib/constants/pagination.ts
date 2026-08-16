/**
 * Constantes de pagination standardisées pour l'application ALVM
 *
 * Ces constantes garantissent une expérience utilisateur cohérente
 * sur toutes les tables de données de l'application.
 */

export const PAGINATION_DEFAULTS = {
  /** Taille de page par défaut : 20 items — lue par `useServerPagination`. */
  DEFAULT_PAGE_SIZE: 20,

  /** Options de taille de page du sélecteur — lues par `DataTableServer`. */
  PAGE_SIZE_OPTIONS: [10, 20, 50, 100],
} as const;

// `MIN_PAGE_SIZE` / `MAX_PAGE_SIZE` retirés (cinquième passe de code mort) :
// aucune lecture dans le dépôt. Les bornes réelles sont celles des schémas
// d'entrée tRPC, écrites littéralement (`z.number().min(1).max(100)`) dans
// chaque procédure paginée — la constante ne standardisait rien.
