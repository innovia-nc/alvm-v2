import { requireRole } from '@/lib/auth';
import { createServerTRPC } from '@/lib/trpc';
import { PageHeader } from '@/components/shared/page-header';
import { ChildEditWithDocuments } from '@/components/shared/child-edit-with-documents';
import { notFound } from 'next/navigation';

interface EditChildPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditChildPage({ params }: EditChildPageProps) {
  // Vérifier que l'utilisateur est staff ou admin
  await requireRole(['STAFF', 'ADMIN']);

  const { id } = await params;

  // Créer le client tRPC server-side
  const trpc = await createServerTRPC();

  // Récupérer l'enfant
  const child = await trpc.children.getById({ id });

  if (!child) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Modifier ${child.firstName} ${child.lastName}`}
        description="Mettre à jour les informations de l'enfant"
      />

      {/* Formulaire + Documents */}
      <ChildEditWithDocuments child={child} userRole="STAFF" />
    </div>
  );
}
