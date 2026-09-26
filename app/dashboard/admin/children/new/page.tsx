import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/shared/page-header';
import { ChildForm } from '@/components/staff/children/child-form';

export default async function NewChildPage() {
  await requireRole(['ADMIN']);

  return (
    <div className="space-y-8">
      <Link className="block underline mb-4" href="/dashboard/admin/children/adult">Inscrire un participant adulte autonome</Link>
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
