'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { trpc } from '@/lib/trpc/client';
import { Calendar, Edit, Trash2, Loader2 } from 'lucide-react';
import Link from 'next/link';

// ============================================================================
// TYPES
// ============================================================================

type Child = {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: Date;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  medicalInfo?: {
    allergies?: string[];
    medications?: string[];
    conditions?: string[];
    diet_restrictions?: string[];
    notes?: string;
  } | null;
};

// ============================================================================
// COMPOSANT
// ============================================================================

interface ChildrenCardsProps {
  initialChildren: Child[];
}

export function ChildrenCards({ initialChildren }: ChildrenCardsProps) {
  const router = useRouter();
  const [deletingChild, setDeletingChild] = useState<Child | null>(null);
  const [error, setError] = useState<string | null>(null);

  const deleteMutation = trpc.children.delete.useMutation();

  // Calculate age from date of birth
  const calculateAge = (birthDate: Date) => {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  async function handleDelete() {
    if (!deletingChild) return;

    try {
      setError(null);
      await deleteMutation.mutateAsync({ id: deletingChild.id });
      setDeletingChild(null);
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Impossible de supprimer cet enfant');
      setDeletingChild(null);
    }
  }

  return (
    <>
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {initialChildren.map((child) => (
          <Card key={child.id} className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-xl">
                    {child.firstName} {child.lastName}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {calculateAge(child.birthDate)} ans
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Date of birth */}
              <div className="flex items-center text-sm text-gray-600">
                <Calendar className="mr-2 h-4 w-4" />
                Né(e) le {new Date(child.birthDate).toLocaleDateString('fr-FR')}
              </div>

              {/* Medical info (if any) */}
              {child.medicalInfo?.notes && (
                <div className="text-sm">
                  <p className="font-medium text-gray-700 mb-1">Notes médicales :</p>
                  <p className="text-gray-600 line-clamp-2">{child.medicalInfo.notes}</p>
                </div>
              )}

              {/* Allergies (if any) */}
              {child.medicalInfo?.allergies && child.medicalInfo.allergies.length > 0 && (
                <div className="text-sm">
                  <p className="font-medium text-gray-700 mb-1">Allergies :</p>
                  <p className="text-gray-600 line-clamp-2">{child.medicalInfo.allergies.join(', ')}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-4">
                <Button asChild variant="outline" className="flex-1">
                  <Link href={`/dashboard/parent/children/${child.id}/edit`}>
                    <Edit className="mr-2 h-4 w-4" />
                    Modifier
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="text-red-600 hover:text-red-700"
                  onClick={() => setDeletingChild(child)}
                  disabled={deleteMutation.isPending}
                  title="Supprimer"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Dialog de confirmation de suppression */}
      <AlertDialog open={!!deletingChild} onOpenChange={(open) => !open && setDeletingChild(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer{' '}
              <strong>
                {deletingChild?.firstName} {deletingChild?.lastName}
              </strong>{' '}
              ?
              <br />
              <br />
              Cette action est irréversible. Toutes les inscriptions associées à cet enfant seront également supprimées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
