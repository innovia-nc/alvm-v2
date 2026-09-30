import { ParentRecordCard } from '@/components/parent/parent-record-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { formatDate } from '@/lib/utils';
import { EmptyState } from '@/components/shared/empty-state';
import { ListPagination } from '@/components/shared/list-pagination';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { auth } from '@/lib/auth/config';
import { createServerTRPC } from '@/lib/trpc';
import { Calendar, MapPin } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

/**
 * Parent Camps List Page
 * Displays available camps for registration
 */
export default async function ParentCampsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth();

  if (!session?.user || session.user.role !== 'PARENT') {
    redirect('/auth/signin');
  }

  const page = Math.max(1, Math.floor(Number((await searchParams).page) || 1));
  const trpc = await createServerTRPC();
  const campsData = await trpc.camps.list.query({
    limit: 20,
    offset: (page - 1) * 20,
    status: 'PUBLISHED',
  });
  const camps = campsData.camps;

  // Filter only published camps
  const availableCamps = camps.filter((camp) => camp.status === 'PUBLISHED');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Camps disponibles"
        description="Découvrez les camps disponibles pour inscrire vos enfants"
      />

      {availableCamps.length === 0 ? (
        <EmptyState
          title="Aucun camp disponible"
          description={<>Aucun camp n'est actuellement ouvert aux inscriptions.</>}
          icon={Calendar}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {availableCamps.map((camp) => (
            <ParentRecordCard
              key={camp.id}
              title={camp.name}
              href={`/dashboard/parent/camps/${camp.id}`}
              status={<StatusBadge type="camp" status={camp.status} />}
              description={<span className="line-clamp-2">{camp.description}</span>}
              summary={
                <>
                  {camp.totalPrice.toLocaleString('fr-FR')} XPF{' '}
                  <span className="text-sm font-normal text-muted-foreground">
                    pour {camp.daysCount} jours
                  </span>
                </>
              }
              actions={
                <Button asChild>
                  <Link href={`/dashboard/parent/camps/${camp.id}`}>Découvrir et inscrire</Link>
                </Button>
              }
            >
              <p className="flex items-start gap-2">
                <Calendar className="mt-0.5 h-4 w-4 shrink-0" />
                {camp.startDate && camp.endDate
                  ? `Du ${formatDate(camp.startDate)} au ${formatDate(camp.endDate)}`
                  : 'Dates à confirmer'}
              </p>
              {camp.location && (
                <p className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                  {camp.location}
                </p>
              )}
              <p>
                {camp.availableSpots > 0
                  ? `${camp.availableSpots} place${camp.availableSpots > 1 ? 's' : ''} disponible${camp.availableSpots > 1 ? 's' : ''}`
                  : 'Camp complet'}{' '}
                · {camp.pricePerDay.toLocaleString('fr-FR')} XPF / jour
              </p>
            </ParentRecordCard>
          ))}
        </div>
      )}
      <ListPagination page={page} total={campsData.total} basePath="/dashboard/parent/camps" />
    </div>
  );
}
