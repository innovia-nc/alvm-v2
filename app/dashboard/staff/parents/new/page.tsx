import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/shared/page-header';
import { StaffParentCreateForm } from './staff-parent-create-form';

export default async function NewParentPage() {
  await requireRole(['STAFF', 'ADMIN']);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nouveau Parent"
        description="Créer un nouveau compte parent"
      />

      <StaffParentCreateForm />
    </div>
  );
}
