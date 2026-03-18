import { auth } from '@/lib/auth/config';
import { redirect } from 'next/navigation';
import { createServerTRPC } from '@/lib/trpc';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ClipboardList } from 'lucide-react';
import Link from 'next/link';
import { RegistrationsList } from './registrations-list';

/**
 * Parent Registrations Page
 * Displays all registrations for the parent's children
 */
export default async function ParentRegistrationsPage() {
  const session = await auth();

  if (!session?.user || session.user.role !== 'PARENT') {
    redirect('/auth/signin');
  }

  const trpc = await createServerTRPC();

  // Get registrations
  const registrationsData = await trpc.registrations.list({ limit: 100, offset: 0 });
  const registrations = registrationsData.registrations;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mes inscriptions"
        description="Gérez les inscriptions de vos enfants aux camps"
        actions={
          <Button asChild>
            <Link href="/dashboard/parent/camps">
              Inscrire à un camp
            </Link>
          </Button>
        }
      />

      {registrations.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <ClipboardList className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-lg font-medium text-gray-900">Aucune inscription</h3>
              <p className="mt-1 text-sm text-gray-500">
                Vous n'avez pas encore inscrit d'enfants à un camp.
              </p>
              <div className="mt-6">
                <Button asChild>
                  <Link href="/dashboard/parent/camps">
                    Voir les camps disponibles
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <RegistrationsList
          initialRegistrations={registrations.map((reg) => ({
            ...reg,
            camp: {
              ...reg.camp,
              startDate: reg.camp.startDate instanceof Date
                ? reg.camp.startDate.toISOString().split('T')[0]!
                : reg.camp.startDate || '',
              endDate: reg.camp.endDate instanceof Date
                ? reg.camp.endDate.toISOString().split('T')[0]!
                : reg.camp.endDate || '',
            },
          }))}
        />
      )}
    </div>
  );
}
