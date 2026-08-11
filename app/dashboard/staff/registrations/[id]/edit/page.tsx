import { requireRole } from '@/lib/auth';
import { createServerTRPC } from '@/lib/trpc';
import { PageHeader } from '@/components/shared/page-header';
import { RegistrationEditForm } from '@/components/admin/registrations/registration-edit-form';
import { notFound } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';

export default async function StaffRegistrationEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(['STAFF', 'ADMIN']);

  const { id } = await params;

  const trpc = await createServerTRPC();

  const registration = await trpc.registrations.getById({ id });

  if (!registration) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Modifier l'Inscription"
        description={`Modification de l'inscription au camp ${registration.camp.name}`}
      />

      <Card>
        <CardContent className="pt-6">
          <RegistrationEditForm
            registration={{
              ...registration,
              camp: {
                ...registration.camp,
                startDate:
                  registration.camp.startDate instanceof Date
                    ? registration.camp.startDate.toISOString().split('T')[0]!
                    : registration.camp.startDate || '',
                endDate:
                  registration.camp.endDate instanceof Date
                    ? registration.camp.endDate.toISOString().split('T')[0]!
                    : registration.camp.endDate || '',
              },
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
