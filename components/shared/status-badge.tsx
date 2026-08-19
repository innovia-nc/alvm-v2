/**
 * <StatusBadge /> — composant unifie pour afficher les statuts metier.
 *
 * Centralise label, classe CSS (utilities `status-badge-*` definies dans
 * `app/globals.css`) et icone Lucide pour chaque combinaison (type, status).
 *
 * Le mapping est exporte separement (`getStatusInfo`) pour pouvoir etre teste
 * en environnement Node (vitest) sans rendu React.
 *
 * Les `label` sont les seules chaines de ce fichier destinees a l'ecran : ils
 * portent donc les accents. Les commentaires et identifiants restent en ASCII.
 * Toute table de statut locale a un composant est un doublon a rebrancher ici
 * (TD-013) — sinon l'ecran affiche l'enum brut ou des couleurs non calibrees.
 */

import { Badge } from '@/components/ui/badge';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  HelpCircle,
  PauseCircle,
  RefreshCcw,
  Send,
  Wallet,
  XCircle,
  type LucideIcon,
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

type StatusBadgeType =
  | 'invoice'
  | 'registration'
  | 'attendance'
  | 'creditNote'
  | 'refund'
  | 'camp';

interface StatusBadgeProps {
  type: StatusBadgeType;
  status: string;
  /** Affiche une icone Lucide a gauche du label. Default: true */
  showIcon?: boolean;
  className?: string;
}

interface StatusInfo {
  label: string;
  className: string;
  icon: LucideIcon;
}

// ============================================================================
// MAPPING — pure, sans dependance React
// ============================================================================

const UNKNOWN_INFO: StatusInfo = {
  label: 'Inconnu',
  className: 'status-badge-draft',
  icon: HelpCircle,
};

const INVOICE_MAP: Record<string, StatusInfo> = {
  DRAFT: { label: 'Devis', className: 'status-badge-draft', icon: FileText },
  SENT: { label: 'Émise', className: 'status-badge-sent', icon: Send },
  PAID: { label: 'Payée', className: 'status-badge-paid', icon: CheckCircle2 },
  OVERDUE: { label: 'En retard', className: 'status-badge-overdue', icon: AlertCircle },
  CANCELLED: { label: 'Annulée', className: 'status-badge-cancelled', icon: XCircle },
  CREDITED: { label: 'Créditée', className: 'status-badge-credited', icon: RefreshCcw },
};

const REGISTRATION_MAP: Record<string, StatusInfo> = {
  PENDING: { label: 'En attente', className: 'status-badge-pending', icon: Clock },
  CONFIRMED: { label: 'Confirmée', className: 'status-badge-confirmed', icon: CheckCircle },
  CANCELLED: { label: 'Annulée', className: 'status-badge-cancelled', icon: XCircle },
  WAITLIST: { label: "Liste d'attente", className: 'status-badge-waitlist', icon: AlertTriangle },
};

const ATTENDANCE_MAP: Record<string, StatusInfo> = {
  PRESENT: { label: 'Présent', className: 'status-badge-present', icon: CheckCircle },
  ABSENT: { label: 'Absent', className: 'status-badge-absent', icon: XCircle },
  LATE: { label: 'En retard', className: 'status-badge-late', icon: Clock },
  EXCUSED: { label: 'Excusé', className: 'status-badge-excused', icon: PauseCircle },
};

const CREDIT_NOTE_MAP: Record<string, StatusInfo> = {
  // Un avoir porte un `InvoiceStatus` (enum Prisma) : les seules valeurs
  // atteignables sont donc celles de cet enum. Les statuts ISSUED / APPLIED,
  // longtemps listes ici « au cas ou », n'existent dans aucun enum ni aucune
  // migration : ils ne pouvaient pas etre rendus.
  DRAFT: { label: 'Brouillon', className: 'status-badge-draft', icon: FileText },
  SENT: { label: 'Émis', className: 'status-badge-sent', icon: Send },
  CANCELLED: { label: 'Annulé', className: 'status-badge-cancelled', icon: XCircle },
};

const CAMP_MAP: Record<string, StatusInfo> = {
  DRAFT: { label: 'Brouillon', className: 'status-badge-draft', icon: FileText },
  PUBLISHED: { label: 'Publié', className: 'status-badge-published', icon: CheckCircle },
  CLOSED: { label: 'Fermé', className: 'status-badge-closed', icon: PauseCircle },
  CANCELLED: { label: 'Annulé', className: 'status-badge-cancelled', icon: XCircle },
};

// Pas de table `payment` : le modele Prisma `Payment` n'a aucune colonne de
// statut, et le seul champ `PaymentStatus` du schema (la colonne
// `registrations.payment_status`) n'est affiche par aucun ecran — le depot ne
// l'ecrit qu'a UNPAID, cf. TD-005. La table qui vivait ici etiquetait donc un
// badge que rien ne pouvait rendre (sixieme passe de code mort).

const REFUND_MAP: Record<string, StatusInfo> = {
  IMMEDIATE_REFUND: {
    label: 'Remboursement immédiat',
    className: 'status-badge-immediate-refund',
    icon: CreditCard,
  },
  FUTURE_CREDIT: {
    label: 'Avoir futur',
    className: 'status-badge-future-credit',
    icon: Wallet,
  },
};

const TYPE_MAPS: Record<StatusBadgeType, Record<string, StatusInfo>> = {
  invoice: INVOICE_MAP,
  registration: REGISTRATION_MAP,
  attendance: ATTENDANCE_MAP,
  creditNote: CREDIT_NOTE_MAP,
  camp: CAMP_MAP,
  refund: REFUND_MAP,
};

/**
 * Retourne l'info badge (label, className, icone) pour un (type, status).
 * Tombe sur un fallback `Inconnu` si non reconnu. Pure fonction — testable.
 */
export function getStatusInfo(type: StatusBadgeType, status: string): StatusInfo {
  const map = TYPE_MAPS[type];
  if (!map) return { ...UNKNOWN_INFO, label: status };
  return map[status] ?? { ...UNKNOWN_INFO, label: status };
}

// ============================================================================
// COMPONENT
// ============================================================================

export function StatusBadge({
  type,
  status,
  showIcon = true,
  className,
}: StatusBadgeProps) {
  const info = getStatusInfo(type, status);
  const Icon = info.icon;

  const composedClassName = [info.className, className].filter(Boolean).join(' ');

  return (
    <Badge variant="outline" className={composedClassName}>
      {showIcon ? <Icon className="mr-1 h-3 w-3" aria-hidden="true" /> : null}
      {info.label}
    </Badge>
  );
}
