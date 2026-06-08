import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/shared/page-header';
import { ChildForm } from '@/components/staff/children/child-form';

export default async function NewChildPage() {
  await requireRole(['ADMIN']);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Nouvel Enfant / Stagiaire"
        description="Créer un nouveau profil enfant"
      />

      {/* Formulaire */}
      <div className="max-w-2xl">
        <ChildForm mode="create" basePath="/dashboard/admin/children" />
      </div>
    </div>
  );
}
