'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status-badge';
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
import { MapPin, X, Loader2 } from 'lucide-react';
import Link from 'next/link';

// ============================================================================
// TYPES
// ============================================================================

type Registration = {
  id: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'WAITLIST';
  totalAmount: number;
  specialRequirements: string | null;
  child: {
    firstName: string;
    lastName: string;
  };
  camp: {
    name: string;
    location: string | null;
    startDate: string;
    endDate: string;
    daysCount: number;
  };
};

// ============================================================================
// COMPOSANT
// ============================================================================

interface RegistrationsListProps {
  initialRegistrations: Registration[];
}

export function RegistrationsList({ initialRegistrations }: RegistrationsListProps) {
  const router = useRouter();
  const [cancellingRegistration, setCancellingRegistration] = useState<Registration | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cancelMutation = trpc.registrations.updateStatus.useMutation();

  async function handleCancel() {
    if (!cancellingRegistration) return;

    try {
      setError(null);
      await cancelMutation.mutateAsync({
        id: cancellingRegistration.id,
        status: 'CANCELLED',
      });
      setCancellingRegistration(null);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Impossible d'annuler cette inscription",
      );
      setCancellingRegistration(null);
    }
  }

  return (
    <>
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        {initialRegistrations.map((registration) => (
          <Card key={registration.id}>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-3">
                    <CardTitle className="break-words text-lg">
                      {registration.child.firstName} {registration.child.lastName}
                    </CardTitle>
                    <StatusBadge type="registration" status={registration.status} />
                  </div>
                  <CardDescription>Inscription au camp : {registration.camp.name}</CardDescription>
                </div>
                <div className="sm:text-right">
                  <div className="text-lg font-semibold">
                    {registration.totalAmount.toLocaleString('fr-FR')} XPF
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Camp details */}
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                {registration.camp.location && (
                  <div className="flex items-center">
                    <MapPin className="mr-2 h-4 w-4" />
                    {registration.camp.location}
                  </div>
                )}
              </div>

              {/* Camp period */}
              <div className="text-sm">
                <p className="text-foreground">
                  Du{' '}
                  {new Date(registration.camp.startDate).toLocaleDateString('fr-FR', {
                    timeZone: 'Pacific/Noumea',
                  })}{' '}
                  au{' '}
                  {new Date(registration.camp.endDate).toLocaleDateString('fr-FR', {
                    timeZone: 'Pacific/Noumea',
                  })}
                </p>
                <p className="text-muted-foreground">
                  {registration.camp.daysCount} jour{registration.camp.daysCount > 1 ? 's' : ''} au
                  total
                </p>
              </div>

              {/* Special requirements */}
              {registration.specialRequirements && (
                <div className="text-sm">
                  <p className="font-medium text-foreground mb-1">Besoins spéciaux :</p>
                  <p className="text-muted-foreground">{registration.specialRequirements}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/dashboard/parent/registrations/${registration.id}`}>
                    Voir le détail
                  </Link>
                </Button>
                {registration.status === 'PENDING' && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive"
                    onClick={() => setCancellingRegistration(registration)}
                    disabled={cancelMutation.isPending}
                  >
                    <X className="mr-2 h-4 w-4" />
                    Annuler l'inscription
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Dialog de confirmation d'annulation */}
      <AlertDialog
        open={!!cancellingRegistration}
        onOpenChange={(open) => !open && setCancellingRegistration(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer l'annulation</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir annuler l'inscription de{' '}
              <strong>
                {cancellingRegistration?.child.firstName} {cancellingRegistration?.child.lastName}
              </strong>{' '}
              au camp <strong>{cancellingRegistration?.camp.name}</strong> ?
              <br />
              <br />
              Cette action est irréversible. Si vous avez déjà payé, un remboursement sera traité.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelMutation.isPending}>Retour</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={cancelMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Annuler l'inscription
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
