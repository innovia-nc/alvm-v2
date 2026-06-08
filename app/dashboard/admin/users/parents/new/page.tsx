import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { ParentCreateForm } from '@/components/admin/parents/parent-create-form';

export default async function NewParentPage() {
  await requireRole(['ADMIN']);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nouveau Parent / Client"
        description="Créer un nouveau compte parent"
      />

      <Card>
        <CardContent className="pt-6">
          <ParentCreateForm />
        </CardContent>
      </Card>
    </div>
  );
}
