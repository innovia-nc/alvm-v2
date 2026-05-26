'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Pencil, Trash2, Eye, FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';

// ============================================================================
// TYPES
// ============================================================================

export type AdminChildType = {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: Date;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  ecole?: string | null;
  medicalInfo: {
    allergies: string[];
    medications: string[];
    conditions: string[];
    diet_restrictions: string[];
    notes: string;
  };
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelation: string | null;
  parents: Array<{
    id: string;
    parentId: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    isPrimary: boolean;
    // Widened to `string | null` to tolerate legacy values outside the
    // canonical enum (see server/routers/children.ts B1 fix).
    relationship: string | null;
  }>;
};

// ============================================================================
// HELPERS
// ============================================================================

function calculateAge(birthDate: Date): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

function getPrimaryParent(child: AdminChildType) {
  return child.parents.find(p => p.isPrimary) || child.parents[0];
}

// ============================================================================
// CELL COMPONENTS
// ============================================================================

interface ParentCellProps {
  child: AdminChildType;
}

function ParentCell({ child }: ParentCellProps) {
  const router = useRouter();
  const primaryParent = getPrimaryParent(child);

  return (
    <div>
      {primaryParent ? (
        <>
          <button
            onClick={() => router.push(`/dashboard/admin/users/parents/${primaryParent.parentId}`)}
            className="font-medium text-sm text-primary hover:underline text-left"
          >
            {primaryParent.firstName} {primaryParent.lastName}
          </button>
          <div className="text-xs text-muted-foreground">{primaryParent.phone}</div>
          {child.parents.length > 1 && (
            <div className="text-xs text-muted-foreground mt-1">
              +{child.parents.length - 1} autre{child.parents.length > 2 ? 's' : ''}
            </div>
          )}
        </>
      ) : (
        <span className="text-muted-foreground text-sm">Aucun parent</span>
      )}
    </div>
  );
}

// ============================================================================
// COLUMN DEFINITIONS
// ============================================================================

export const adminChildColumns: ColumnDef<AdminChildType>[] = [
  {
    accessorKey: 'firstName',
    header: 'Enfant',
    cell: ({ row }) => {
      const child = row.original;
      const genderLabel = child.gender === 'MALE' ? 'Garçon' : child.gender === 'FEMALE' ? 'Fille' : 'Autre';

      return (
        <div>
          <div className="font-medium">
            {child.firstName} {child.lastName}
          </div>
          <div className="text-xs text-muted-foreground">{genderLabel}</div>
        </div>
      );
    },
  },
  {
    accessorKey: 'birthDate',
    header: 'Âge',
    cell: ({ row }) => {
      const child = row.original;
      const age = calculateAge(child.birthDate);
      const birthDateStr = new Date(child.birthDate).toLocaleDateString('fr-FR');

      return (
        <div className="text-sm">
          <div className="font-medium">{age} ans</div>
          <div className="text-xs text-muted-foreground">{birthDateStr}</div>
        </div>
      );
    },
  },
  {
    accessorKey: 'parents',
    header: 'Parent',
    cell: ({ row }) => {
      return <ParentCell child={row.original} />;
    },
  },
  {
    accessorKey: 'ecole',
    header: 'École',
    cell: ({ row }) => {
      const child = row.original;
      return (
        <div className="text-sm">
          {child.ecole ? (
            <span>{child.ecole}</span>
          ) : (
            <span className="text-muted-foreground text-xs">Non renseignée</span>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: 'emergencyContactName',
    header: 'Contact d\'urgence',
    cell: ({ row }) => {
      const child = row.original;
      if (!child.emergencyContactName && !child.emergencyContactPhone) {
        return <span className="text-xs text-muted-foreground">Non renseigné</span>;
      }
      return (
        <div className="text-sm">
          <div>{child.emergencyContactName || '-'}</div>
          <div className="text-xs text-muted-foreground">{child.emergencyContactPhone || '-'}</div>
        </div>
      );
    },
  },
  {
    id: 'actions',
    header: () => <div className="text-right">Actions</div>,
    cell: ({ row }) => {
      return <AdminChildActions item={row.original} onDelete={() => {}} />;
    },
  },
];

// ============================================================================
// ACTIONS COMPONENT
// ============================================================================

interface AdminChildActionsProps {
  item: AdminChildType;
  onDelete?: (item: AdminChildType) => void;
}

export function AdminChildActions({ item, onDelete }: AdminChildActionsProps) {
  const router = useRouter();

  return (
    <div className="text-right">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Ouvrir menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => router.push(`/dashboard/admin/children/${item.id}`)}>
            <Eye className="mr-2 h-4 w-4" />
            Voir détails
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => window.open(`/api/generate/child-profile/${item.id}`, '_blank')}>
            <FileText className="mr-2 h-4 w-4" />
            Voir / imprimer la fiche
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push(`/dashboard/admin/children/${item.id}/edit`)}>
            <Pencil className="mr-2 h-4 w-4" />
            Modifier
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onDelete?.(item)} className="text-red-600">
            <Trash2 className="mr-2 h-4 w-4" />
            Supprimer
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
