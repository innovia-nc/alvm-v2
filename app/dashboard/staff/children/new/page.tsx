import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/shared/page-header';
import { ChildForm } from '@/components/staff/children/child-form';

export default async function NewChildPage() {
  // Vérifier que l'utilisateur est staff ou admin
  await requireRole(['STAFF', 'ADMIN']);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nouvel Enfant"
        description="Ajouter un nouvel enfant au système"
      />

      {/* Formulaire */}
      <div className="max-w-2xl">
        <ChildForm mode="create" />
      </div>
    </div>
  );
}
