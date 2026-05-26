'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  MoreHorizontal,
  Pencil,
  Send,
  XCircle,
  Copy,
  CalendarDays,
  Users,
  ClipboardCheck,
  Eye,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

// ============================================================================
// TYPES
// ============================================================================

export type StaffCampType = {
  id: string;
  name: string;
  description: string;
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'CANCELLED';
  location: string;
  pricePerDay: number;
  maxCapacity: number;
  daysCount: number;
  campTypeId: string;
  registrationDeadline: Date;
  registrationsCount: number;
  availableSpots: number;
};

// ============================================================================
// HELPERS
// ============================================================================

function getStatusBadge(status: string) {
  switch (status) {
    case 'DRAFT':
      return {
        label: 'Brouillon',
        className: 'bg-gray-100 text-gray-800 border-gray-200',
      };
    case 'PUBLISHED':
      return {
        label: 'Publié',
        className: 'bg-green-100 text-green-800 border-green-200',
      };
    case 'CLOSED':
      return {
        label: 'Fermé',
        className: 'bg-red-100 text-red-800 border-red-200',
      };
    case 'CANCELLED':
      return {
        label: 'Annulé',
        className: 'bg-orange-100 text-orange-800 border-orange-200',
      };
    default:
      return {
        label: status,
        className: '',
      };
  }
}

// ============================================================================
// COLUMN DEFINITIONS
// ============================================================================

export const staffCampColumns: ColumnDef<StaffCampType>[] = [
  {
    accessorKey: 'name',
    header: 'Camp',
    cell: ({ row }) => {
      const camp = row.original;
      return (
        <Link href={`/dashboard/staff/camps/${camp.id}`} className="block hover:underline">
          <div className="font-medium">{camp.name}</div>
          <div className="text-xs text-muted-foreground truncate max-w-[200px]">
            {camp.location}
          </div>
        </Link>
      );
    },
  },
  {
    accessorKey: 'daysCount',
    header: () => <div className="text-center">Durée</div>,
    cell: ({ row }) => {
      return (
        <div className="text-center">
          <div className="font-medium">{row.original.daysCount} jours</div>
        </div>
      );
    },
  },
  {
    accessorKey: 'maxCapacity',
    header: () => <div className="text-center">Capacité</div>,
    cell: ({ row }) => {
      const camp = row.original;
      const fillRate =
        camp.maxCapacity > 0
          ? Math.round((camp.registrationsCount / camp.maxCapacity) * 100)
          : 0;

      return (
        <div className="text-center">
          <div className="flex items-center justify-center gap-1">
            <Users className="h-3 w-3 text-muted-foreground" />
            <span className="font-medium">
              {camp.registrationsCount} / {camp.maxCapacity}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">{fillRate}% rempli</div>
        </div>
      );
    },
  },
  {
    accessorKey: 'registrationDeadline',
    header: 'Date limite',
    cell: ({ row }) => {
      return (
        <div className="flex items-center gap-1">
          <CalendarDays className="h-3 w-3 text-muted-foreground" />
          <span className="text-sm">
            {new Date(row.original.registrationDeadline).toLocaleDateString(
              'fr-FR'
            )}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: 'status',
    header: 'Statut',
    cell: ({ row }) => {
      const statusInfo = getStatusBadge(row.original.status);
      return (
        <Badge variant="outline" className={statusInfo.className}>
          {statusInfo.label}
        </Badge>
      );
    },
  },
  {
    id: 'actions',
    header: () => <div className="text-right">Actions</div>,
    cell: ({ row }) => {
      return (
        <StaffCampActions
          item={row.original}
          onPublish={() => {}}
          onClose={() => {}}
          onDuplicate={() => {}}
        />
      );
    },
  },
];

// ============================================================================
// ACTIONS COMPONENT
// ============================================================================

interface StaffCampActionsProps {
  item: StaffCampType;
  onPublish?: (item: StaffCampType) => void;
  onClose?: (item: StaffCampType) => void;
  onDuplicate?: (item: StaffCampType) => void;
}

export function StaffCampActions({
  item,
  onPublish,
  onClose,
  onDuplicate,
}: StaffCampActionsProps) {
  const router = useRouter();

  const isDraft = item.status === 'DRAFT';
  const isPublished = item.status === 'PUBLISHED';
  const canPublish = isDraft;
  const canClose = isDraft || isPublished;

  return (
    <div className="text-right">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm">
            <span className="sr-only">Menu d&apos;actions</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => router.push(`/dashboard/staff/camps/${item.id}`)}
          >
            <Eye className="mr-2 h-4 w-4" />
            Voir
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => router.push(`/dashboard/staff/camps/${item.id}/edit`)}
          >
            <Pencil className="mr-2 h-4 w-4" />
            Modifier
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => router.push(`/dashboard/staff/camps/${item.id}?tab=presences`)}
          >
            <ClipboardCheck className="mr-2 h-4 w-4" />
            Présences
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => onDuplicate?.(item)}>
            <Copy className="mr-2 h-4 w-4" />
            Dupliquer
          </DropdownMenuItem>

          {canPublish && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onPublish?.(item)}>
                <Send className="mr-2 h-4 w-4" />
                Publier
              </DropdownMenuItem>
            </>
          )}

          {canClose && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onClose?.(item)}
                className="text-destructive focus:text-destructive"
              >
                <XCircle className="mr-2 h-4 w-4" />
                Fermer
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
