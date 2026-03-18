import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth/config';
import { createServerTRPC } from '@/lib/trpc';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { CancelRegistrationButton } from '@/components/parent/cancel-registration-button';
import {
  Calendar,
  MapPin,
  User,
  Clock,
  AlertCircle,
  FileText,
  ArrowLeft,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import Link from 'next/link';

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
  const registration = await trpc.registrations.getById({ id });

  if (!registration) {
    return {
      title: 'Inscription non trouvée | ALVM',
    };
  }

  return {
    title: `Inscription - ${registration.camp.name} | ALVM`,
    description: `Détails de l'inscription de ${registration.child.firstName} ${registration.child.lastName}`,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const getStatusVariant = (status: string) => {
  switch (status) {
    case 'CONFIRMED':
      return 'default' as const;
    case 'PENDING':
      return 'secondary' as const;
    case 'CANCELLED':
      return 'destructive' as const;
    case 'WAITLIST':
      return 'outline' as const;
    default:
      return 'secondary' as const;
  }
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case 'CONFIRMED':
      return 'Confirmée';
    case 'PENDING':
      return 'En attente';
    case 'CANCELLED':
      return 'Annulée';
    case 'WAITLIST':
      return 'Liste d\'attente';
    default:
      return status;
  }
};

// ============================================================================
// PAGE COMPONENT
// ============================================================================

export default async function RegistrationDetailPage({
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
  const registration = await trpc.registrations.getById({ id });

  // Registration not found or not accessible
  if (!registration) {
    notFound();
  }

  const canCancel = registration.status === 'PENDING' || registration.status === 'CONFIRMED';
  const isCancelled = registration.status === 'CANCELLED';

  return (
    <div className="space-y-6">
      {/* Header with back button */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/parent/registrations">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <PageHeader
          title={`Inscription au ${registration.camp.name}`}
          description={`${registration.child.firstName} ${registration.child.lastName}`}
        />
      </div>

      {/* Status Badge */}
      <div className="flex items-center gap-2">
        <Badge variant={getStatusVariant(registration.status)} className="text-base px-3 py-1">
          {getStatusLabel(registration.status)}
        </Badge>
      </div>

      {/* Cancelled warning */}
      {isCancelled && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Cette inscription a été annulée le {formatDate(registration.updatedAt)}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content - 2 columns */}
        <div className="lg:col-span-2 space-y-6">
          {/* Camp information */}
          <Card>
            <CardHeader>
              <CardTitle>Informations du camp</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Lieu</p>
                    <p className="text-sm text-muted-foreground">{registration.camp.location}</p>
                  </div>
                </div>

                <Separator />

                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Date limite d'inscription</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(registration.camp.registrationDeadline)}
                    </p>
                  </div>
                </div>

                <Separator />

                <div className="flex items-start gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Statut du camp</p>
                    <Badge variant="outline" className="mt-1">
                      {registration.camp.status === 'PUBLISHED' ? 'Publié' : registration.camp.status}
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Camp period */}
          <Card>
            <CardHeader>
              <CardTitle>Période du camp</CardTitle>
              <CardDescription>
                {registration.camp.daysCount} journée{registration.camp.daysCount > 1 ? 's' : ''} au total
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Date de début</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Calendar className="h-4 w-4 text-primary" />
                      <span className="font-medium">{registration.camp.startDate ? formatDate(new Date(registration.camp.startDate)) : 'Non définie'}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Date de fin</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Calendar className="h-4 w-4 text-primary" />
                      <span className="font-medium">{registration.camp.endDate ? formatDate(new Date(registration.camp.endDate)) : 'Non définie'}</span>
                    </div>
                  </div>
                </div>
                <Separator />
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Durée totale</span>
                  <span className="font-semibold">{registration.camp.daysCount} jour{registration.camp.daysCount > 1 ? 's' : ''}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Special requirements */}
          {registration.specialRequirements && (
            <Card>
              <CardHeader>
                <CardTitle>Besoins spécifiques</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-line">
                  {registration.specialRequirements}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar - 1 column */}
        <div className="space-y-6">
          {/* Child info */}
          <Card>
            <CardHeader>
              <CardTitle>Enfant inscrit</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-3">
                <User className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium">
                    {registration.child.firstName} {registration.child.lastName}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Né(e) le {formatDate(registration.child.birthDate)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pricing */}
          <Card>
            <CardHeader>
              <CardTitle>Tarification</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Prix par jour</span>
                <span className="font-medium">
                  {registration.camp.pricePerDay.toLocaleString('fr-FR')} XPF
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Nombre de jours</span>
                <span className="font-medium">{registration.camp.daysCount}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="font-semibold">Total</span>
                <span className="text-2xl font-bold text-primary">
                  {registration.totalAmount.toLocaleString('fr-FR')} XPF
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Invoice link */}
          {registration.invoiceId && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Facture</CardTitle>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full" asChild>
                  <Link href={`/dashboard/parent/invoices/${registration.invoiceId}`}>
                    <FileText className="mr-2 h-4 w-4" />
                    Voir la facture
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Registration info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Informations d'inscription</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Date d'inscription</span>
                <span>{formatDate(registration.registrationDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Dernière modification</span>
                <span>{formatDate(registration.updatedAt)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Cancel button */}
          {canCancel && !isCancelled && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <CancelRegistrationButton
                  registrationId={registration.id}
                  childName={`${registration.child.firstName} ${registration.child.lastName}`}
                  campName={registration.camp.name}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
