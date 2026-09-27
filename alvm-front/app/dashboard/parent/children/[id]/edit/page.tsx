import { BackButton } from '@/components/shared/back-button';
import { ChildEditWithDocuments } from '@/components/shared/child-edit-with-documents';
import { PageHeader } from '@/components/shared/page-header';
import { requireRole } from '@/lib/auth';
import { createServerTRPC, notFoundOnMissing } from '@/lib/trpc';
import { notFound } from 'next/navigation';

interface EditChildPageProps {
  params: Promise<{ id: string }>;
}

export default async function ParentEditChildPage({ params }: EditChildPageProps) {
  await requireRole(['PARENT', 'ADMIN']);

  const { id } = await params;

  const trpc = await createServerTRPC();

  const child = await trpc.children.getById.query({ id }).catch(notFoundOnMissing);

  if (!child) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Modifier ${child.firstName} ${child.lastName}`}
        description="Mettre à jour les informations de l'enfant"
        actions={<BackButton href="/dashboard/parent/children" label="Retour" />}
      />

      {/* Formulaire + Documents */}
      <ChildEditWithDocuments child={child} userRole="PARENT" />
    </div>
  );
}
