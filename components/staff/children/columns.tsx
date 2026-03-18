'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';

// ============================================================================
// TYPES
// ============================================================================

export type StaffChildType = {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: Date;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
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
    relationship: 'mother' | 'father' | 'guardian' | 'step_mother' | 'step_father' | 'grandparent' | 'other' | null;
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

function getPrimaryParent(child: StaffChildType) {
  return child.parents.find(p => p.isPrimary) || child.parents[0];
}

// ============================================================================
// COLUMN DEFINITIONS
// ============================================================================

export const staffChildColumns: ColumnDef<StaffChildType>[] = [
  {
    accessorKey: 'firstName',
    header: 'Nom',
    cell: ({ row }) => {
      const child = row.original;
      const genderLabel = child.gender === 'MALE' ? 'Gar\u00e7on' : child.gender === 'FEMALE' ? 'Fille' : 'Autre';

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
    header: '\u00c2ge',
    cell: ({ row }) => {
      const age = calculateAge(row.original.birthDate);
      return <div className="text-sm">{age} ans</div>;
    },
  },
  {
    accessorKey: 'parents',
    header: 'Parent',
    cell: ({ row }) => {
      const child = row.original;
      const primaryParent = getPrimaryParent(child);

      return (
        <div>
          {primaryParent ? (
            <>
              <div className="font-medium text-sm">
                {primaryParent.firstName} {primaryParent.lastName}
              </div>
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
    accessorKey: 'medicalInfo.allergies',
    header: 'Allergies',
    cell: ({ row }) => {
      const child = row.original;
      const hasAllergies = child.medicalInfo?.allergies && child.medicalInfo.allergies.length > 0;

      return hasAllergies ? (
        <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
          <AlertTriangle className="mr-1 h-3 w-3" />
          {child.medicalInfo.allergies.length}
        </Badge>
      ) : (
        <span className="text-xs text-muted-foreground">Aucune</span>
      );
    },
  },
  {
    accessorKey: 'medicalInfo.conditions',
    header: 'Conditions',
    cell: ({ row }) => {
      const child = row.original;
      const hasConditions = child.medicalInfo?.conditions && child.medicalInfo.conditions.length > 0;

      return hasConditions ? (
        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
          <AlertTriangle className="mr-1 h-3 w-3" />
          {child.medicalInfo.conditions.length}
        </Badge>
      ) : (
        <span className="text-xs text-muted-foreground">Aucune</span>
      );
    },
  },
  {
    id: 'actions',
    header: () => <div className="text-right">Actions</div>,
    cell: ({ row }) => {
      return <StaffChildActions item={row.original} onDelete={() => {}} />;
    },
  },
];

// ============================================================================
// ACTIONS COMPONENT
// ============================================================================

interface StaffChildActionsProps {
  item: StaffChildType;
  onDelete?: (item: StaffChildType) => void;
}

export function StaffChildActions({ item, onDelete }: StaffChildActionsProps) {
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
          <DropdownMenuItem onClick={() => router.push(`/dashboard/staff/children/${item.id}/edit`)}>
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
