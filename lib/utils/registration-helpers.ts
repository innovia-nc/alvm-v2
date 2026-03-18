/**
 * Utilitaires pour les inscriptions
 *
 * Fonctions pures réutilisables pour le traitement des données d'inscriptions
 */

import {
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  type LucideIcon,
} from 'lucide-react';

/**
 * Calcule l'âge à partir d'une date de naissance
 *
 * @param birthDate - Date de naissance
 * @returns Âge en années
 *
 * @example
 * ```ts
 * const age = calculateAge(new Date('2010-05-15'));
 * console.log(age); // 14 (en 2024)
 * ```
 */
export function calculateAge(birthDate: Date): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }

  return age;
}

/**
 * Type de statut d'inscription
 */
export type RegistrationStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'WAITLIST';

/**
 * Information de badge pour un statut
 */
export interface StatusBadgeInfo {
  label: string;
  icon: LucideIcon;
  className: string;
}

/**
 * Obtient les informations de badge pour un statut d'inscription
 *
 * @param status - Statut de l'inscription
 * @returns Information de badge (label, icon, className)
 *
 * @example
 * ```tsx
 * const { label, icon: Icon, className } = getStatusBadge('CONFIRMED');
 * return (
 *   <Badge className={className}>
 *     <Icon className="mr-1 h-3 w-3" />
 *     {label}
 *   </Badge>
 * );
 * ```
 */
export function getStatusBadge(status: string): StatusBadgeInfo {
  switch (status) {
    case 'PENDING':
      return {
        label: 'En attente',
        icon: Clock,
        className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      };
    case 'CONFIRMED':
      return {
        label: 'Confirmée',
        icon: CheckCircle,
        className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      };
    case 'CANCELLED':
      return {
        label: 'Annulée',
        icon: XCircle,
        className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      };
    case 'WAITLIST':
      return {
        label: "Liste d'attente",
        icon: AlertCircle,
        className: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
      };
    default:
      return {
        label: status,
        icon: AlertCircle,
        className: '',
      };
  }
}

/**
 * Type de statut de camp
 */
export type CampStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'CANCELLED';

/**
 * Obtient les informations de badge pour un statut de camp
 *
 * @param status - Statut du camp
 * @returns Information de badge (label, variant)
 *
 * @example
 * ```tsx
 * const { label, variant } = getCampStatusBadge('PUBLISHED');
 * return <Badge variant={variant}>{label}</Badge>;
 * ```
 */
export function getCampStatusBadge(status: CampStatus): {
  label: string;
  variant: 'default' | 'destructive' | 'outline' | 'secondary';
} {
  switch (status) {
    case 'DRAFT':
      return { label: 'Brouillon', variant: 'secondary' };
    case 'PUBLISHED':
      return { label: 'Publié', variant: 'default' };
    case 'CLOSED':
      return { label: 'Fermé', variant: 'outline' };
    case 'CANCELLED':
      return { label: 'Annulé', variant: 'destructive' };
    default:
      return { label: status, variant: 'outline' };
  }
}

/**
 * Formate un montant en XPF
 *
 * @param amount - Montant à formater
 * @returns Montant formaté avec séparateurs de milliers
 *
 * @example
 * ```ts
 * formatAmount(150000); // "150 000"
 * formatAmount(5000);   // "5 000"
 * ```
 */
export function formatAmount(amount: number): string {
  return amount.toLocaleString('fr-FR');
}

/**
 * Formate une date au format français court
 *
 * @param date - Date à formater
 * @returns Date formatée (ex: "15/05/2024")
 *
 * @example
 * ```ts
 * formatDate(new Date('2024-05-15')); // "15/05/2024"
 * ```
 */
export function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('fr-FR');
}

/**
 * Formate une date avec l'heure au format français
 *
 * @param date - Date à formater
 * @returns Date et heure formatées (ex: "15/05/2024 14:30")
 *
 * @example
 * ```ts
 * formatDateTime(new Date('2024-05-15T14:30:00')); // "15/05/2024 14:30"
 * ```
 */
export function formatDateTime(date: Date): string {
  return new Date(date).toLocaleString('fr-FR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Vérifie si une date est passée
 *
 * @param date - Date à vérifier
 * @returns true si la date est passée
 *
 * @example
 * ```ts
 * isPastDate(new Date('2020-01-01')); // true
 * isPastDate(new Date('2030-01-01')); // false
 * ```
 */
export function isPastDate(date: Date): boolean {
  return new Date(date) < new Date();
}

/**
 * Calcule le nombre de jours entre deux dates
 *
 * @param startDate - Date de début
 * @param endDate - Date de fin
 * @returns Nombre de jours (arrondi au supérieur)
 *
 * @example
 * ```ts
 * const days = calculateDaysBetween(
 *   new Date('2024-05-15'),
 *   new Date('2024-05-20')
 * ); // 5
 * ```
 */
export function calculateDaysBetween(startDate: Date, endDate: Date): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}
