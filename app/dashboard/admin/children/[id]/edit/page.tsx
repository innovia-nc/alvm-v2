import { requireRole } from '@/lib/auth';
import { createServerTRPC } from '@/lib/trpc';
import { PageHeader } from '@/components/shared/page-header';
import { ChildEditWithDocuments } from '@/components/shared/child-edit-with-documents';
import { notFound } from 'next/navigation';

export default async function ChildEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(['ADMIN']);

  const { id } = await params;

  const trpc = await createServerTRPC();

  // Récupérer l'enfant
  const child = await trpc.children.getById({ id });

  if (!child) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Modifier ${child.firstName} ${child.lastName}`}
        description="Mettre à jour les informations de l'enfant"
      />

      {/* Formulaire + Documents */}
      <ChildEditWithDocuments child={child} userRole="ADMIN" />
    </div>
  );
}
