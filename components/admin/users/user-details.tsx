'use client';

import { StaffDocumentsSection } from '@/components/shared/staff-documents-section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useDashboardBasePath } from '@/lib/hooks/use-dashboard-base-path';
import { trpc } from '@/lib/trpc/client';
import { Calendar, Pencil, Phone, Shield, Trash2, User } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

// ============================================================================
// TYPES
// ============================================================================

type UserRole = 'PARENT' | 'STAFF' | 'ADMIN';

type StaffProfile = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string;
};

type UserForDetails = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  role: UserRole;
  emailVerified: Date | null;
  createdAt: Date;
  updatedAt: Date;
  parentProfile: null | {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    address: string | null;
    city: string | null;
    postalCode: string | null;
  };
  staffProfile: null | StaffProfile;
};

interface UsersDetailsProps {
  user: UserForDetails;
  staffDirectory?: boolean;
}

// ============================================================================
// HELPER
// ============================================================================

function formatDateFR(d: Date) {
  return new Date(d).toLocaleDateString('fr-FR', {
    timeZone: 'Pacific/Noumea',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ============================================================================
// COMPOSANT
// ============================================================================

export function UsersDetails({ user, staffDirectory = false }: UsersDetailsProps) {
  const router = useRouter();
  const basePath = useDashboardBasePath();
  const directoryPath = `${basePath}/users${staffDirectory ? '/staff' : ''}`;
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const deleteMutation = trpc.users.delete.useMutation();

  async function handleDelete() {
    try {
      await deleteMutation.mutateAsync({ id: user.id });
      toast.success('Utilisateur supprimé avec succès');
      router.push(directoryPath);
      router.refresh();
    } catch (err) {
      const errorMessage =
        err instanceof Error && err.message ? err.message : 'Erreur lors de la suppression';
      toast.error(errorMessage);
    }
  }

  const staff = user.staffProfile;

  return (
    <div className="space-y-6">
      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild>
          <Link href={`${directoryPath}/${user.id}/edit`}>
            <Pencil className="mr-2 h-4 w-4" />
            Modifier
          </Link>
        </Button>

        <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
          <Trash2 className="mr-2 h-4 w-4" />
          Supprimer
        </Button>
      </div>

      {/* Informations de base */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Informations du personnel
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Nom complet */}
            <div>
              <p className="text-sm font-medium text-muted-foreground">Nom</p>
              <p className="text-base font-semibold">
                {staff ? `${staff.firstName} ${staff.lastName}` : (user.name ?? '—')}
              </p>
            </div>

            {/* Email */}
            <div>
              <p className="text-sm font-medium text-muted-foreground">Email</p>
              <p className="text-base">{user.email}</p>
            </div>

            {/* Téléphone */}
            <div className="flex items-start gap-2">
              <Phone className="h-4 w-4 text-muted-foreground mt-1" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Téléphone</p>
                <p className="text-base">{staff?.phone ?? 'Non renseigné'}</p>
              </div>
            </div>

            {/* Rôle */}
            <div>
              <p className="text-sm font-medium text-muted-foreground">Rôle</p>
              <div className="flex items-center gap-2 mt-1">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <Badge variant="secondary">{user.role}</Badge>
              </div>
            </div>

            {/* Date de création */}
            <div>
              <p className="text-sm font-medium text-muted-foreground">Compte créé le</p>
              <div className="flex items-center gap-2 mt-1">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <p className="text-base">{formatDateFR(user.createdAt)}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Documents */}
      <StaffDocumentsSection
        staffId={user.id}
        userRole={
          basePath === '/dashboard/parent'
            ? 'PARENT'
            : basePath === '/dashboard/staff'
              ? 'STAFF'
              : 'ADMIN'
        }
      />

      {/* Dialogue de confirmation de suppression */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer l'utilisateur{' '}
              <span className="font-bold">{user.name ?? user.email}</span> ? Cette action supprimera
              également le profil associé et est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Suppression...' : 'Supprimer définitivement'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
