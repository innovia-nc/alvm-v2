import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth/config';
import { createServerTRPC } from '@/lib/trpc';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { RegistrationForm } from '@/components/parent/registration-form';
import {
  Calendar,
  MapPin,
  Users,
  Clock,
  AlertCircle,
  Info,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';

// ============================================================================
// METADATA
// ============================================================================

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const trpc = await createServerTRPC();
  const camp = await trpc.camps.getById({ id });

  if (!camp) {
    return {
      title: 'Camp non trouvé | ALVM',
    };
  }

  return {
    title: `${camp.name} | ALVM`,
    description: camp.description,
  };
}

// ============================================================================
// PAGE COMPONENT
// ============================================================================

export default async function CampDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  if (!session?.user || session.user.role !== 'PARENT') {
    redirect('/auth/signin');
  }

  const trpc = await createServerTRPC();
  const camp = await trpc.camps.getById({ id });

  // Camp not found or not published
  if (!camp) {
    notFound();
  }

  // Calculate capacity percentage
  const capacityPercentage = Math.round(
    ((camp.maxCapacity - camp.availableSpots) / camp.maxCapacity) * 100
  );
  const isAlmostFull = capacityPercentage >= 80;

  // Check if registration deadline has passed
  const now = new Date();
  const deadline = new Date(camp.registrationDeadline);
  const isDeadlinePassed = now > deadline;

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title={camp.name}
        description={`${camp.campType.name} • ${camp.location}`}
      />

      {/* Status and warnings */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={camp.status === 'PUBLISHED' ? 'default' : 'secondary'}>
            {camp.status === 'PUBLISHED' ? 'Ouvert aux inscriptions' : camp.status}
          </Badge>
          <Badge variant="outline">
            {camp.availableSpots} place{camp.availableSpots > 1 ? 's' : ''} disponible{camp.availableSpots > 1 ? 's' : ''}
          </Badge>
        </div>

        {/* Almost full warning */}
        {isAlmostFull && camp.availableSpots > 0 && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Attention : Le camp est bientôt complet ({capacityPercentage}% de remplissage).
              Il ne reste que {camp.availableSpots} place{camp.availableSpots > 1 ? 's' : ''} !
            </AlertDescription>
          </Alert>
        )}

        {/* Deadline warning */}
        {isDeadlinePassed && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              La date limite d'inscription ({formatDate(deadline)}) est dépassée.
              Les inscriptions ne sont plus acceptées.
            </AlertDescription>
          </Alert>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content - 2 columns */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <Card>
            <CardHeader>
              <CardTitle>Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground whitespace-pre-line">
                {camp.description}
              </p>
            </CardContent>
          </Card>

          {/* Camp period */}
          <Card>
            <CardHeader>
              <CardTitle>Période du camp</CardTitle>
              <CardDescription>
                {camp.daysCount} journée{camp.daysCount > 1 ? 's' : ''} au total
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-start justify-between border rounded-lg p-4 bg-muted/50">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-primary" />
                      <span className="font-medium">Date de début</span>
                    </div>
                    <p className="text-sm text-muted-foreground pl-6">
                      {camp.startDate ? formatDate(new Date(camp.startDate)) : 'Non définie'}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-primary" />
                      <span className="font-medium">Date de fin</span>
                    </div>
                    <p className="text-sm text-muted-foreground pl-6">
                      {camp.endDate ? formatDate(new Date(camp.endDate)) : 'Non définie'}
                    </p>
                  </div>
                </div>
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    L'inscription se fait automatiquement pour toute la durée du camp ({camp.daysCount} jours).
                  </AlertDescription>
                </Alert>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - 1 column */}
        <div className="space-y-6">
          {/* Camp info */}
          <Card>
            <CardHeader>
              <CardTitle>Informations pratiques</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Location */}
              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Lieu</p>
                  <p className="text-sm text-muted-foreground">{camp.location}</p>
                </div>
              </div>

              <Separator />

              {/* Camp type description */}
              {camp.campType.description && (
                <>
                  <div className="flex items-start gap-3">
                    <Users className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Type de camp</p>
                      <p className="text-sm text-muted-foreground">
                        {camp.campType.description}
                      </p>
                    </div>
                  </div>

                  <Separator />
                </>
              )}

              {/* Capacity */}
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Capacité</p>
                  <p className="text-sm text-muted-foreground">
                    {camp.registrationsCount} / {camp.maxCapacity} inscrits
                  </p>
                </div>
              </div>

              <Separator />

              {/* Registration deadline */}
              <div className="flex items-start gap-3">
                <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Date limite d'inscription</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(deadline)}
                  </p>
                </div>
              </div>

              <Separator />

              {/* Price */}
              <div className="rounded-lg bg-primary/10 p-4">
                <p className="text-sm text-muted-foreground">Prix par jour</p>
                <p className="text-2xl font-bold text-primary">
                  {camp.pricePerDay.toLocaleString('fr-FR')} XPF
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Camp type info */}
          {camp.campType.description && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Type de camp</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {camp.campType.description}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Registration form */}
      {!isDeadlinePassed && (
        <RegistrationForm
          campId={camp.id}
          campName={camp.name}
          pricePerDay={camp.pricePerDay}
          availableSpots={camp.availableSpots}
          startDate={camp.startDate instanceof Date ? camp.startDate.toISOString().split('T')[0]! : camp.startDate || ''}
          endDate={camp.endDate instanceof Date ? camp.endDate.toISOString().split('T')[0]! : camp.endDate || ''}
          daysCount={camp.daysCount}
        />
      )}
    </div>
  );
}
