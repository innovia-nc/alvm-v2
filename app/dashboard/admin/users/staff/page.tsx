import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { StaffTableClient } from './staff-table-client';

export default async function AdminStaffPage() {
  await requireRole(['ADMIN']);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestion du Personnel"
        description="Liste et gestion des membres du personnel"
        actions={
          <Link href="/dashboard/admin/users/staff/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Ajouter un membre
            </Button>
          </Link>
        }
      />

      <StaffTableClient />
    </div>
  );
}
