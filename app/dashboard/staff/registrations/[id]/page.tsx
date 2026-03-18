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
  // Vérifier que l'utilisateur est staff ou admin
  await requireRole(['STAFF', 'ADMIN']);

  const { id } = await params;

  // Créer le client tRPC server-side
  const trpc = await createServerTRPC();

  // Récupérer l'inscription
  const registration = await trpc.registrations.getById({ id });

  if (!registration) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Détails de l'inscription"
        description={`Inscription du ${new Date(registration.registrationDate).toLocaleDateString('fr-FR')}`}
      />

      <RegistrationDetails registration={registration} />
    </div>
  );
}
