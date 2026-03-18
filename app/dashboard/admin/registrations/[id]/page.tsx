import { requireRole } from '@/lib/auth';
import { createServerTRPC } from '@/lib/trpc';
import { PageHeader } from '@/components/shared/page-header';
import { RegistrationDetails } from '@/components/admin/registrations/registration-details';
import { notFound } from 'next/navigation';

export default async function RegistrationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Vérifier que l'utilisateur est admin
  await requireRole(['ADMIN']);

  const { id } = await params;

  // Créer le client tRPC server-side
  const trpc = await createServerTRPC();

  // Récupérer l'inscription
  const registration = await trpc.registrations.getById({ id });

  if (!registration) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Détails de l'Inscription"
        description={`Inscription au camp ${registration.camp.name}`}
      />

      <RegistrationDetails
        registration={{
          ...registration,
          camp: {
            ...registration.camp,
            startDate: (registration.camp.startDate instanceof Date
              ? registration.camp.startDate.toISOString().split('T')[0]
              : registration.camp.startDate) ?? '',
            endDate: (registration.camp.endDate instanceof Date
              ? registration.camp.endDate.toISOString().split('T')[0]
              : registration.camp.endDate) ?? '',
          },
        }}
      />
    </div>
  );
}
