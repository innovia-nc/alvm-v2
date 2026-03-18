/**
 * React Query Cache Configuration
 *
 * Définit les durées de cache optimales pour chaque type de données
 * selon leur fréquence de changement.
 */

/**
 * Durées de cache recommandées par type de données
 */
export const CACHE_TIMES = {
  // ========================================
  // DONNÉES STATIQUES (changent rarement)
  // ========================================

  /**
   * Types de camps : très rarement modifiés
   * Exemples: "Camp d'été", "Stage sportif"
   */
  CAMP_TYPES: 30 * 60 * 1000, // 30 minutes

  /**
   * Méthodes de paiement : très rarement modifiées
   * Exemples: "Espèces", "Chèque", "Virement"
   */
  PAYMENT_METHODS: 30 * 60 * 1000, // 30 minutes

  /**
   * Staff members : changent peu souvent
   */
  STAFF: 10 * 60 * 1000, // 10 minutes

  /**
   * Parents : profils modifiés occasionnellement
   */
  PARENTS: 5 * 60 * 1000, // 5 minutes

  // ========================================
  // DONNÉES SEMI-STATIQUES
  // ========================================

  /**
   * Camps : modifiés régulièrement par le staff
   */
  CAMPS: 3 * 60 * 1000, // 3 minutes

  /**
   * Enfants : ajoutés/modifiés par les parents
   */
  CHILDREN: 3 * 60 * 1000, // 3 minutes

  // ========================================
  // DONNÉES DYNAMIQUES (changent souvent)
  // ========================================

  /**
   * Inscriptions : statut change fréquemment
   * (PENDING → CONFIRMED, ajout/suppression)
   */
  REGISTRATIONS: 1 * 60 * 1000, // 1 minute

  /**
   * Factures : montants et statuts changent
   */
  INVOICES: 1 * 60 * 1000, // 1 minute

  /**
   * Paiements : ajoutés régulièrement
   */
  PAYMENTS: 1 * 60 * 1000, // 1 minute

  /**
   * Statistiques et rapports : données calculées
   */
  STATS: 2 * 60 * 1000, // 2 minutes

  // ========================================
  // DONNÉES TEMPS RÉEL
  // ========================================

  /**
   * Profil utilisateur courant : peut changer à tout moment
   */
  CURRENT_USER: 30 * 1000, // 30 secondes

  /**
   * Disponibilité des camps : change à chaque inscription
   */
  CAMP_AVAILABILITY: 30 * 1000, // 30 secondes
} as const;

/**
 * Configurations de cache prédéfinies pour les queries communes
 */
export const QUERY_CONFIGS = {
  // Types de camps
  campTypes: {
    staleTime: CACHE_TIMES.CAMP_TYPES,
    gcTime: CACHE_TIMES.CAMP_TYPES * 2,
  },

  // Méthodes de paiement
  paymentMethods: {
    staleTime: CACHE_TIMES.PAYMENT_METHODS,
    gcTime: CACHE_TIMES.PAYMENT_METHODS * 2,
  },

  // Staff members
  staff: {
    staleTime: CACHE_TIMES.STAFF,
    gcTime: CACHE_TIMES.STAFF * 2,
  },

  // Parents
  parents: {
    staleTime: CACHE_TIMES.PARENTS,
    gcTime: CACHE_TIMES.PARENTS * 2,
  },

  // Camps (liste)
  campsList: {
    staleTime: CACHE_TIMES.CAMPS,
    gcTime: CACHE_TIMES.CAMPS * 2,
    refetchOnWindowFocus: false,
  },

  // Camp individuel (détails peuvent changer plus souvent)
  campDetails: {
    staleTime: CACHE_TIMES.CAMPS,
    gcTime: CACHE_TIMES.CAMPS * 2,
    refetchOnWindowFocus: false,
  },

  // Disponibilité du camp (temps réel)
  campAvailability: {
    staleTime: CACHE_TIMES.CAMP_AVAILABILITY,
    gcTime: CACHE_TIMES.CAMP_AVAILABILITY * 2,
    refetchOnWindowFocus: true, // Refetch quand l'utilisateur revient
  },

  // Enfants
  children: {
    staleTime: CACHE_TIMES.CHILDREN,
    gcTime: CACHE_TIMES.CHILDREN * 2,
  },

  // Inscriptions
  registrations: {
    staleTime: CACHE_TIMES.REGISTRATIONS,
    gcTime: CACHE_TIMES.REGISTRATIONS * 2,
  },

  // Factures
  invoices: {
    staleTime: CACHE_TIMES.INVOICES,
    gcTime: CACHE_TIMES.INVOICES * 2,
  },

  // Paiements
  payments: {
    staleTime: CACHE_TIMES.PAYMENTS,
    gcTime: CACHE_TIMES.PAYMENTS * 2,
  },

  // Statistiques
  statistics: {
    staleTime: CACHE_TIMES.STATS,
    gcTime: CACHE_TIMES.STATS * 2,
    refetchOnWindowFocus: false,
  },

  // Profil utilisateur
  currentUser: {
    staleTime: CACHE_TIMES.CURRENT_USER,
    gcTime: CACHE_TIMES.CURRENT_USER * 4,
    refetchOnWindowFocus: true,
  },
} as const;

/**
 * Utilitaire pour créer une config de cache personnalisée
 */
export function createCacheConfig(options: {
  staleTime: number;
  gcTime?: number;
  refetchOnWindowFocus?: boolean;
  refetchOnMount?: boolean;
}) {
  return {
    staleTime: options.staleTime,
    gcTime: options.gcTime ?? options.staleTime * 2,
    refetchOnWindowFocus: options.refetchOnWindowFocus ?? false,
    refetchOnMount: options.refetchOnMount ?? false,
  };
}

/**
 * Exemple d'utilisation dans les composants :
 *
 * ```tsx
 * import { QUERY_CONFIGS } from '@/lib/trpc/cache-config';
 *
 * // Liste des camps avec cache optimisé
 * const { data: camps } = trpc.camps.list.useQuery(
 *   { limit: 20 },
 *   QUERY_CONFIGS.campsList
 * );
 *
 * // Types de camps (quasi-statique)
 * const { data: campTypes } = trpc.campTypes.list.useQuery(
 *   {},
 *   QUERY_CONFIGS.campTypes
 * );
 *
 * // Disponibilité en temps réel
 * const { data: availability } = trpc.camps.getById.useQuery(
 *   { id: campId },
 *   QUERY_CONFIGS.campAvailability
 * );
 * ```
 */
