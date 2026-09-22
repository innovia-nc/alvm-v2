import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/shared/page-header';
import { ChildForm } from '@/components/staff/children/child-form';

export default async function NewChildPage() {
  // Vérifier que l'utilisateur est staff ou admin
  await requireRole(['STAFF', 'ADMIN']);

  return (
    <div className="space-y-6">
      <Link className="block underline mb-4" href="/dashboard/staff/children/adult">Inscrire un participant adulte autonome</Link>
      <PageHeader
        title="Nouvel Enfant / Stagiaire"
        description="Ajouter un nouvel enfant au système"
      />

      {/* Formulaire */}
      <div className="max-w-2xl">
        <ChildForm mode="create" />
      </div>
    </div>
  );
}
