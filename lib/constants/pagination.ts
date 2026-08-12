/**
 * Constantes de pagination standardisées pour l'application ALVM
 *
 * Ces constantes garantissent une expérience utilisateur cohérente
 * sur toutes les tables de données de l'application.
 */

export const PAGINATION_DEFAULTS = {
  /** Taille de page par défaut : 20 items */
  DEFAULT_PAGE_SIZE: 20,

  /** Options de taille de page disponibles dans le sélecteur */
  PAGE_SIZE_OPTIONS: [10, 20, 50, 100],
} as const;
