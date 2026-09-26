import { ParentRecordCard } from '@/components/parent/parent-record-card';
import { CancelRegistrationButton } from '@/components/parent/cancel-registration-button';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Calendar, MapPin } from 'lucide-react';
import Link from 'next/link';
import { formatDate } from '@/lib/utils';

type Registration = {
  id: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'WAITLIST';
  totalAmount: number;
  cancellationRequestedAt?: Date | null;
  child: { firstName: string; lastName: string };
  camp: {
    name: string;
    location: string | null;
    startDate: string;
    endDate: string;
    daysCount: number;
  };
};

export function RegistrationsList({
  initialRegistrations,
}: {
  initialRegistrations: Registration[];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {initialRegistrations.map((registration) => {
        const childName = `${registration.child.firstName} ${registration.child.lastName}`;
        const canCancel =
          registration.status !== 'CANCELLED' &&
          !registration.cancellationRequestedAt &&
          new Date(registration.camp.startDate) > new Date();
        return (
          <ParentRecordCard
            key={registration.id}
            title={registration.camp.name}
            href={`/dashboard/parent/registrations/${registration.id}`}
            description={childName}
            status={<StatusBadge type="registration" status={registration.status} />}
            summary={
              <>
                {registration.totalAmount.toLocaleString('fr-FR')} XPF{' '}
                <span className="text-sm font-normal text-muted-foreground">au total</span>
              </>
            }
            actions={
              <>
                <Button asChild>
                  <Link href={`/dashboard/parent/registrations/${registration.id}`}>
                    Voir l’inscription
                  </Link>
                </Button>
                {canCancel && (
                  <CancelRegistrationButton
                    registrationId={registration.id}
                    childName={childName}
                    campName={registration.camp.name}
                  />
                )}
              </>
            }
          >
            <p className="flex items-start gap-2">
              <Calendar className="mt-0.5 h-4 w-4 shrink-0" />
              Du {formatDate(new Date(registration.camp.startDate))} au{' '}
              {formatDate(new Date(registration.camp.endDate))}
            </p>
            {registration.camp.location && (
              <p className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                {registration.camp.location}
              </p>
            )}
            {registration.cancellationRequestedAt && registration.status !== 'CANCELLED' && (
              <p className="font-medium text-foreground">
                Demande d’annulation transmise au secrétariat.
              </p>
            )}
          </ParentRecordCard>
        );
      })}
    </div>
  );
}
