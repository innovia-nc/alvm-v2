import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { StaffParentsTableClient } from './staff-parents-table-client';

export default async function StaffParentsPage() {
  await requireRole(['STAFF', 'ADMIN']);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestion des Parents"
        description="Liste des parents et gestion de leurs informations"
        actions={
          <Link href="/dashboard/staff/parents/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nouveau parent
            </Button>
          </Link>
        }
      />

      <StaffParentsTableClient />
    </div>
  );
}
