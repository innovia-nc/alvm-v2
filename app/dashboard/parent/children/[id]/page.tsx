import { requireRole } from '@/lib/auth';
import { createServerTRPC } from '@/lib/trpc';
import { PageHeader } from '@/components/shared/page-header';
import { ChildDocumentsSection } from '@/components/shared/child-documents-section';
import { ChildRegistrationsHistory } from '@/components/admin/children/child-registrations-history';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Pencil,
  User,
  Phone,
  Calendar,
  Heart,
  AlertTriangle,
  Activity,
} from 'lucide-react';

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
// PAGE COMPONENT
// ============================================================================

export default async function ParentChildDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(['PARENT', 'ADMIN']);

  const { id } = await params;

  const trpc = await createServerTRPC();

  const child = await trpc.children.getById({ id });

  if (!child) {
    notFound();
  }

  /**
   * Pré-chargement SSR de l'historique des inscriptions dans le contexte du
   * PARENT authentifié. `createServerTRPC` lit la session NextAuth active
   * (via `auth()` dans `createContext`). Le router `registrations.list`
   * applique automatiquement `where.parentId = ctx.user.id` quand
   * `ctx.user.role === 'PARENT'` — le scope cross-parent est donc garanti
   * côté serveur, sans aucune logique supplémentaire ici.
   */
  const registrationsData = await trpc.registrations.list({
    childId: id,
    sortBy: 'registrationDate',
    sortOrder: 'desc',
    limit: 50,
    offset: 0,
  });

  const age = calculateAge(child.birthDate);
  const hasAllergies = child.medicalInfo?.allergies && child.medicalInfo.allergies.length > 0;
  const hasConditions = child.medicalInfo?.conditions && child.medicalInfo.conditions.length > 0;
  const hasMedications =
    child.medicalInfo?.medications && child.medicalInfo.medications.length > 0;
  const hasDietRestrictions =
    child.medicalInfo?.diet_restrictions && child.medicalInfo.diet_restrictions.length > 0;

  return (
    <div className="space-y-6">
      {/* Header with back button and edit action */}
      <PageHeader
        title={`${child.firstName} ${child.lastName}`}
        description={`${age} ans`}
        actions={
          <div className="flex gap-2">
            <Link href="/dashboard/parent/children">
              <Button variant="outline" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Retour
              </Button>
            </Link>
            <Link href={`/dashboard/parent/children/${child.id}/edit`}>
              <Button size="sm">
                <Pencil className="mr-2 h-4 w-4" />
                Modifier
              </Button>
            </Link>
          </div>
        }
      />

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
              <p className="text-sm font-medium text-muted-foreground">Prenom</p>
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
                {child.gender === 'MALE' ? 'Garcon' : child.gender === 'FEMALE' ? 'Fille' : 'Autre'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

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
                    <p className="text-sm font-medium text-muted-foreground">Telephone</p>
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

      {/* Informations medicales */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Informations Medicales
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Allergies */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Allergies</p>
            {hasAllergies ? (
              <div className="flex flex-wrap gap-2">
                {child.medicalInfo.allergies.map((allergy: string, index: number) => (
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

          {/* Conditions medicales */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Conditions medicales</p>
            {hasConditions ? (
              <div className="flex flex-wrap gap-2">
                {child.medicalInfo.conditions.map((condition: string, index: number) => (
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
              <p className="text-sm text-muted-foreground">Aucune condition medicale</p>
            )}
          </div>

          {/* Medicaments */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Medicaments</p>
            {hasMedications ? (
              <div className="flex flex-wrap gap-2">
                {child.medicalInfo.medications.map((medication: string, index: number) => (
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
              <p className="text-sm text-muted-foreground">Aucun medicament</p>
            )}
          </div>

          {/* Restrictions alimentaires */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">
              Restrictions alimentaires
            </p>
            {hasDietRestrictions ? (
              <div className="flex flex-wrap gap-2">
                {child.medicalInfo.diet_restrictions.map((diet: string, index: number) => (
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

          {/* Notes medicales */}
          {child.medicalInfo?.notes && (
            <div className="pt-4 border-t">
              <p className="text-sm font-medium text-muted-foreground mb-2">Notes medicales</p>
              <p className="text-sm whitespace-pre-wrap bg-muted/50 p-3 rounded-lg">
                {child.medicalInfo.notes}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Historique des inscriptions — données SSR, aucun refetch réseau */}
      <ChildRegistrationsHistory
        childId={child.id}
        initialData={registrationsData}
      />

      {/* Documents */}
      <ChildDocumentsSection
        childId={child.id}
        userRole="PARENT"
      />
    </div>
  );
}
