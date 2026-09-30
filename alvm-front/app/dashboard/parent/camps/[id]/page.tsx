import { BackButton } from '@/components/shared/back-button';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth/config';
import { createServerTRPC, notFoundOnMissing } from '@/lib/trpc';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RegistrationForm } from '@/components/parent/registration-form';
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
  const camp = await trpc.camps.getById.query({ id }).catch(notFoundOnMissing);

  if (!camp) {
    return {
      title: 'Camp non trouvé',
    };
  }

  return {
    title: camp.name,
    description: camp.description,
  };
}

// ============================================================================
// PAGE COMPONENT
// ============================================================================

export default async function CampDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();

  if (!session?.user || session.user.role !== 'PARENT') {
    redirect('/auth/signin');
  }

  const trpc = await createServerTRPC();
  const camp = await trpc.camps.getById.query({ id }).catch(notFoundOnMissing);

  // Camp not found or not published
  if (!camp) {
    notFound();
  }

  // Calculate capacity percentage
  const capacityPercentage = Math.round(
    ((camp.maxCapacity - camp.availableSpots) / camp.maxCapacity) * 100,
  );
  const isAlmostFull = capacityPercentage >= 80;

  // Check if registration deadline has passed
  const now = new Date();
  const deadline = new Date(camp.registrationDeadline);
  const isDeadlinePassed = now > deadline;

  return (
    <div className="space-y-6">
      <PageHeader
        title={camp.name}
        description={`${camp.campType.name} • ${camp.location}`}
        actions={
          <>
            <BackButton href="/dashboard/parent/camps" label="Tous les camps" />
            {!isDeadlinePassed && camp.availableSpots > 0 && (
              <Button asChild>
                <a href="#inscription">Inscrire mon enfant</a>
              </Button>
            )}
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge type="camp" status={camp.status} />
        <Badge variant="outline">
          {camp.availableSpots} place{camp.availableSpots > 1 ? 's' : ''} disponible
          {camp.availableSpots > 1 ? 's' : ''}
        </Badge>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>Le séjour</CardTitle>
              <CardDescription>
                {camp.daysCount} jours, inscription pour toute la durée du camp.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Dates</dt>
                  <dd className="mt-1 font-medium">
                    {camp.startDate && camp.endDate
                      ? `Du ${formatDate(camp.startDate)} au ${formatDate(camp.endDate)}`
                      : 'Dates à confirmer'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Lieu</dt>
                  <dd className="mt-1 font-medium">{camp.location}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Inscription avant le</dt>
                  <dd className="mt-1 font-medium">{formatDate(deadline)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Tarif du séjour complet</dt>
                  <dd className="mt-1 text-xl font-semibold text-primary">
                    {camp.totalPrice.toLocaleString('fr-FR')} XPF
                  </dd>
                  <dd className="mt-1 text-muted-foreground">
                    {camp.pricePerDay.toLocaleString('fr-FR')} XPF / jour
                  </dd>
                </div>
              </dl>
              <div className="border-t pt-4 text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
                {camp.description}
              </div>
              {camp.campType.description && (
                <p className="text-sm text-muted-foreground">{camp.campType.description}</p>
              )}
            </CardContent>
          </Card>
          {isAlmostFull && camp.availableSpots > 0 && !isDeadlinePassed && (
            <Alert>
              <AlertDescription>
                Il reste {camp.availableSpots} place{camp.availableSpots > 1 ? 's' : ''} pour ce
                séjour.
              </AlertDescription>
            </Alert>
          )}
          {isDeadlinePassed && (
            <Alert>
              <AlertDescription>
                La date limite d’inscription est dépassée. Consultez les autres camps disponibles.
              </AlertDescription>
            </Alert>
          )}
        </div>
        {!isDeadlinePassed && (
          <section
            id="inscription"
            className="scroll-mt-24 lg:col-span-2"
            aria-label="Inscrire un enfant"
          >
            <RegistrationForm
              campId={camp.id}
              campName={camp.name}
              pricePerDay={camp.pricePerDay}
              totalPrice={camp.totalPrice}
              availableSpots={camp.availableSpots}
              startDate={
                camp.startDate instanceof Date
                  ? camp.startDate.toISOString().split('T')[0]!
                  : camp.startDate || ''
              }
              endDate={
                camp.endDate instanceof Date
                  ? camp.endDate.toISOString().split('T')[0]!
                  : camp.endDate || ''
              }
              daysCount={camp.daysCount}
            />
          </section>
        )}
      </div>
    </div>
  );
}
