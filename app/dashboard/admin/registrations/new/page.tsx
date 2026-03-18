import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/shared/page-header';
import { RegistrationForm } from '@/components/admin/registrations/registration-form';

export default async function NewRegistrationPage() {
  // Vérifier que l'utilisateur est admin
  await requireRole(['ADMIN']);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Nouvelle Inscription"
        description="Créer une nouvelle inscription à un camp"
      />

      <RegistrationForm />
    </div>
  );
}
