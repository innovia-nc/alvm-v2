import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { ParentsTableClient } from './parents-table-client';

export default async function AdminParentsPage() {
  await requireRole(['ADMIN']);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestion des Parents"
        description="Liste et gestion des comptes parents"
        actions={
          <Link href="/dashboard/admin/users/parents/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nouveau parent
            </Button>
          </Link>
        }
      />

      <ParentsTableClient />
    </div>
  );
}
