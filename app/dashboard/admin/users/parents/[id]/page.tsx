import { requireRole } from '@/lib/auth';
import { createServerTRPC } from '@/lib/trpc';
import { PageHeader } from '@/components/shared/page-header';
import { ParentDetails } from '@/components/admin/parents/parent-details';
import { notFound } from 'next/navigation';

export default async function ParentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(['ADMIN']);

  const { id } = await params;

  const trpc = await createServerTRPC();

  const parent = await trpc.parents.getById({ id });

  if (!parent) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Détails du Parent"
        description={`${parent.firstName} ${parent.lastName}`}
      />

      <ParentDetails parent={parent} />
    </div>
  );
}
