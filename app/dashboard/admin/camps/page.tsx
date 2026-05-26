import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { AdminCampsTableClient } from '@/components/admin/camps/admin-camps-table-client';

export default async function AdminCampsPage() {
  // Vérifier que l'utilisateur est admin
  await requireRole(['ADMIN']);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestion des ACM"
        description="Créez et gérez les ACM (centres aérés)"
        actions={
          <Link href="/dashboard/admin/camps/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nouvel ACM
            </Button>
          </Link>
        }
      />

      <AdminCampsTableClient />
    </div>
  );
}
