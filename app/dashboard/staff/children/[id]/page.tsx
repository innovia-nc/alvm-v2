import { requireRole } from '@/lib/auth';
import { createServerTRPC } from '@/lib/trpc';
import { PageHeader } from '@/components/shared/page-header';
import { ChildDetails } from '@/components/admin/children/child-details';
import { notFound } from 'next/navigation';

export default async function StaffChildDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(['STAFF', 'ADMIN']);

  const { id } = await params;

  const trpc = await createServerTRPC();

  const child = await trpc.children.getById({ id });

  if (!child) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Détails de l'Enfant"
        description={`${child.firstName} ${child.lastName}`}
      />

      <ChildDetails child={child} />
    </div>
  );
}
