import { requireRole } from '@/lib/auth';
import { createServerTRPC } from '@/lib/trpc';
import { PageHeader } from '@/components/shared/page-header';
import { ParentEditForm } from '@/components/admin/parents/parent-edit-form';
import { notFound } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';

export default async function StaffParentEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(['STAFF', 'ADMIN']);

  const { id } = await params;

  const trpc = await createServerTRPC();

  const parent = await trpc.parents.getById({ id });

  if (!parent) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Modifier le Parent / Client"
        description={`Modification de ${parent.firstName} ${parent.lastName}`}
      />

      <Card>
        <CardContent className="pt-6">
          <ParentEditForm parent={parent} />
        </CardContent>
      </Card>
    </div>
  );
}
