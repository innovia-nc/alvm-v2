import { ParentStatusFilters } from '@/components/parent/parent-status-filters';
import { EmptyState } from '@/components/shared/empty-state';
import { ListPagination } from '@/components/shared/list-pagination';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { auth } from '@/lib/auth/config';
import { createServerTRPC } from '@/lib/trpc';
import { ClipboardList } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { RegistrationsList } from './registrations-list';

/**
 * Parent Registrations Page
 * Displays all registrations for the parent's children
 */
export default async function ParentRegistrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const session = await auth();

  if (!session?.user || session.user.role !== 'PARENT') {
    redirect('/auth/signin');
  }

  const page = Math.max(1, Math.floor(Number((await searchParams).page) || 1));
  const requestedStatus = (await searchParams).status;
  const status =
    requestedStatus === 'PENDING' ||
    requestedStatus === 'CONFIRMED' ||
    requestedStatus === 'WAITLIST' ||
    requestedStatus === 'CANCELLED'
      ? requestedStatus
      : undefined;
  const trpc = await createServerTRPC();

  // Get registrations
  const registrationsData = await trpc.registrations.list({
    limit: 20,
    offset: (page - 1) * 20,
    status,
  });
  const registrations = registrationsData.registrations;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mes inscriptions"
        description="Gérez les inscriptions de vos enfants aux camps"
        actions={
          <Button asChild>
            <Link href="/dashboard/parent/camps">Inscrire à un camp</Link>
          </Button>
        }
      />

      <ParentStatusFilters
        basePath="/dashboard/parent/registrations"
        value={status}
        options={[
          { label: 'Toutes' },
          { value: 'PENDING', label: 'En attente' },
          { value: 'CONFIRMED', label: 'Confirmées' },
          { value: 'WAITLIST', label: 'Liste d’attente' },
          { value: 'CANCELLED', label: 'Annulées' },
        ]}
      />
      {registrations.length === 0 ? (
        <EmptyState
          title={status ? 'Aucune inscription pour ce statut' : 'Aucune inscription'}
          description={
            status
              ? 'Choisissez un autre statut pour retrouver vos inscriptions.'
              : 'Choisissez un camp pour inscrire votre enfant.'
          }
          icon={ClipboardList}
          action={
            <>
              <div className="mt-6">
                <Button asChild>
                  <Link href="/dashboard/parent/camps">Voir les camps disponibles</Link>
                </Button>
              </div>
            </>
          }
        />
      ) : (
        <RegistrationsList
          initialRegistrations={registrations.map((reg) => ({
            ...reg,
            camp: {
              ...reg.camp,
              startDate:
                reg.camp.startDate instanceof Date
                  ? reg.camp.startDate.toISOString().split('T')[0]!
                  : reg.camp.startDate || '',
              endDate:
                reg.camp.endDate instanceof Date
                  ? reg.camp.endDate.toISOString().split('T')[0]!
                  : reg.camp.endDate || '',
            },
          }))}
        />
      )}
      <ListPagination
        page={page}
        total={registrationsData.total}
        basePath={`/dashboard/parent/registrations${status ? `?status=${status}` : ''}`}
      />
    </div>
  );
}
