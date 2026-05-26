'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChildParentsList } from '@/components/shared/child-parents-list';
import { ChildDocumentsSection } from '@/components/shared/child-documents-section';
import {
  Pencil,
  Trash2,
  User,
  Phone,
  Calendar,
  Heart,
  AlertTriangle,
  Activity,
} from 'lucide-react';
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

interface Child {
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
  createdAt: Date;
  updatedAt: Date;
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
}

interface ChildDetailsProps {
  child: Child;
}

// ============================================================================
// HELPER FUNCTIONS
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

// ============================================================================
// COMPOSANT
// ============================================================================

export function ChildDetails({ child }: ChildDetailsProps) {
  const router = useRouter();
  const basePath = useDashboardBasePath();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const deleteMutation = trpc.children.delete.useMutation();

  async function handleDelete() {
    try {
      await deleteMutation.mutateAsync({ id: child.id });
      toast.success('Enfant supprimé avec succès');
      router.push(`${basePath}/children`);
      router.refresh();
    } catch (err: any) {
      const errorMessage = err.message || 'Erreur lors de la suppression';
      toast.error(errorMessage);
    }
  }

  const age = calculateAge(child.birthDate);
  const hasAllergies = child.medicalInfo?.allergies && child.medicalInfo.allergies.length > 0;
  const hasConditions = child.medicalInfo?.conditions && child.medicalInfo.conditions.length > 0;
  const hasMedications =
    child.medicalInfo?.medications && child.medicalInfo.medications.length > 0;
  const hasDietRestrictions =
    child.medicalInfo?.diet_restrictions && child.medicalInfo.diet_restrictions.length > 0;

  return (
    <div className="space-y-6">
      {/* Actions */}
      <div className="flex gap-4">
        <Button asChild>
          <Link href={`${basePath}/children/${child.id}/edit`}>
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
            Informations Personnelles
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Prénom</p>
              <p className="text-base">{child.firstName}</p>
            </div>

            <div>
              <p className="text-sm font-medium text-muted-foreground">Nom</p>
              <p className="text-base">{child.lastName}</p>
            </div>

            <div className="flex items-start gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground mt-1" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Date de naissance</p>
                <p className="text-base">
                  {new Date(child.birthDate).toLocaleDateString('fr-FR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
                <p className="text-sm text-muted-foreground">{age} ans</p>
              </div>
            </div>

            <div>
              <p className="text-sm font-medium text-muted-foreground">Genre</p>
              <p className="text-base">
                {child.gender === 'MALE' ? 'Garçon' : child.gender === 'FEMALE' ? 'Fille' : 'Autre'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Parents */}
      <ChildParentsList parents={child.parents} />

      {/* Contact d'urgence */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5" />
            Contact d'Urgence
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {child.emergencyContactName || child.emergencyContactPhone ? (
            <>
              {child.emergencyContactName && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Nom</p>
                  <p className="text-base">{child.emergencyContactName}</p>
                </div>
              )}

              {child.emergencyContactPhone && (
                <div className="flex items-start gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground mt-1" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Téléphone</p>
                    <p className="text-base">{child.emergencyContactPhone}</p>
                  </div>
                </div>
              )}

              {child.emergencyContactRelation && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Relation</p>
                  <p className="text-base">{child.emergencyContactRelation}</p>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Non renseigné</p>
          )}
        </CardContent>
      </Card>

      {/* Informations médicales */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Informations Médicales
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Allergies */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Allergies</p>
            {hasAllergies ? (
              <div className="flex flex-wrap gap-2">
                {child.medicalInfo.allergies.map((allergy, index) => (
                  <Badge
                    key={index}
                    variant="outline"
                    className="bg-orange-50 text-orange-700 border-orange-200"
                  >
                    <AlertTriangle className="mr-1 h-3 w-3" />
                    {allergy}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Aucune allergie connue</p>
            )}
          </div>

          {/* Conditions médicales */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Conditions médicales</p>
            {hasConditions ? (
              <div className="flex flex-wrap gap-2">
                {child.medicalInfo.conditions.map((condition, index) => (
                  <Badge
                    key={index}
                    variant="outline"
                    className="bg-red-50 text-red-700 border-red-200"
                  >
                    <AlertTriangle className="mr-1 h-3 w-3" />
                    {condition}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Aucune condition médicale</p>
            )}
          </div>

          {/* Médicaments */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Médicaments</p>
            {hasMedications ? (
              <div className="flex flex-wrap gap-2">
                {child.medicalInfo.medications.map((medication, index) => (
                  <Badge
                    key={index}
                    variant="outline"
                    className="bg-blue-50 text-blue-700 border-blue-200"
                  >
                    {medication}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Aucun médicament</p>
            )}
          </div>

          {/* Restrictions alimentaires */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">
              Restrictions alimentaires
            </p>
            {hasDietRestrictions ? (
              <div className="flex flex-wrap gap-2">
                {child.medicalInfo.diet_restrictions.map((diet, index) => (
                  <Badge
                    key={index}
                    variant="outline"
                    className="bg-purple-50 text-purple-700 border-purple-200"
                  >
                    {diet}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Aucune restriction alimentaire</p>
            )}
          </div>

          {/* Notes médicales */}
          {child.medicalInfo?.notes && (
            <div className="pt-4 border-t">
              <p className="text-sm font-medium text-muted-foreground mb-2">Notes médicales</p>
              <p className="text-sm whitespace-pre-wrap bg-muted/50 p-3 rounded-lg">
                {child.medicalInfo.notes}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Documents */}
      <ChildDocumentsSection
        childId={child.id}
        userRole={basePath === '/dashboard/parent' ? 'PARENT' : basePath === '/dashboard/staff' ? 'STAFF' : 'ADMIN'}
      />

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer l'enfant{' '}
              <strong>
                {child.firstName} {child.lastName}
              </strong>{' '}
              ? Cette action est irréversible.
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
