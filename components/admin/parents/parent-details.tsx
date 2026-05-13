'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2, User, Mail, Phone, MapPin, Calendar } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { toast } from 'sonner';
import { useDashboardBasePath } from '@/lib/hooks/use-dashboard-base-path';
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

// ============================================================================
// TYPES
// ============================================================================

interface Parent {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  mobilePhone: string;
  homePhone: string;
  workPhone: string;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  employeur?: string | null;
  fonction?: string | null;
  createdAt: Date;
  updatedAt: Date;
  children?: Array<{
    id: string;
    firstName: string;
    lastName: string;
    dateOfBirth: Date;
  }>;
}

interface ParentDetailsProps {
  parent: Parent;
}

// ============================================================================
// COMPOSANT
// ============================================================================

export function ParentDetails({ parent }: ParentDetailsProps) {
  const router = useRouter();
  const basePath = useDashboardBasePath();
  const parentsPath =
    basePath === '/dashboard/admin' ? '/dashboard/admin/users/parents' : `${basePath}/parents`;
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const deleteMutation = trpc.parents.delete.useMutation();

  async function handleDelete() {
    try {
      await deleteMutation.mutateAsync({ id: parent.id });
      toast.success('Parent supprimé avec succès');
      router.push(parentsPath);
      router.refresh();
    } catch (err: any) {
      const errorMessage = err.message || 'Erreur lors de la suppression';
      toast.error(errorMessage);
    }
  }

  return (
    <div className="space-y-6">
      {/* Actions */}
      <div className="flex gap-4">
        <Button asChild>
          <Link href={`${parentsPath}/${parent.id}/edit`}>
            <Pencil className="mr-2 h-4 w-4" />
            Modifier
          </Link>
        </Button>

        <Button
          variant="destructive"
          onClick={() => setShowDeleteDialog(true)}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Supprimer
        </Button>
      </div>

      {/* Informations personnelles */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Informations Personnelles
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Prénom</p>
              <p className="text-base">{parent.firstName}</p>
            </div>

            <div>
              <p className="text-sm font-medium text-muted-foreground">Nom</p>
              <p className="text-base">{parent.lastName}</p>
            </div>

            <div className="flex items-start gap-2">
              <Mail className="h-4 w-4 text-muted-foreground mt-1" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Email</p>
                <p className="text-base">{parent.email}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-start gap-2">
                <Phone className="h-4 w-4 text-muted-foreground mt-1" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Téléphone Mobile</p>
                  <p className="text-base">{parent.mobilePhone}</p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Phone className="h-4 w-4 text-muted-foreground mt-1" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Téléphone Domicile</p>
                  <p className="text-base">{parent.homePhone}</p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Phone className="h-4 w-4 text-muted-foreground mt-1" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Téléphone Professionnel</p>
                  <p className="text-base">{parent.workPhone}</p>
                </div>
              </div>
            
            </div>
            {parent.employeur && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Employeur</p>
                <p className="text-base">{parent.employeur}</p>
              </div>
            )}

            {parent.fonction && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Fonction</p>
                <p className="text-base">{parent.fonction}</p>
              </div>
            )}
          </div>

          {(parent.address || parent.city || parent.postalCode) && (
            <div className="flex items-start gap-2 pt-4 border-t">
              <MapPin className="h-4 w-4 text-muted-foreground mt-1" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Adresse</p>
                <div className="text-base">
                  {parent.address && <p>{parent.address}</p>}
                  {(parent.postalCode || parent.city) && (
                    <p>
                      {parent.postalCode} {parent.city}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 pt-4 border-t">
            <Calendar className="h-4 w-4 text-muted-foreground mt-1" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Compte créé le</p>
              <p className="text-base">
                {new Date(parent.createdAt).toLocaleDateString('fr-FR', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Enfants */}
      {parent.children && parent.children.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Enfants ({parent.children.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {parent.children.map((child) => (
                <div
                  key={child.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <p className="font-medium">
                      {child.firstName} {child.lastName}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Né(e) le{' '}
                      {new Date(child.dateOfBirth).toLocaleDateString('fr-FR', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`${basePath}/children/${child.id}`}>
                      Voir détails
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer le parent{' '}
              <strong>
                {parent.firstName} {parent.lastName}
              </strong>{' '}
              ? Cette action est irréversible.
              {parent.children && parent.children.length > 0 && (
                <span className="block mt-2 text-destructive font-medium">
                  Attention : Ce parent a {parent.children.length} enfant(s) associé(s).
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Suppression...' : 'Supprimer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
