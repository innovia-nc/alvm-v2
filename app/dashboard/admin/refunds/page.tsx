import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { AdminRefundsTableClient } from '@/components/admin/refunds/admin-refunds-table-client';

export default async function AdminRefundsPage() {
  // Vérifier que l'utilisateur est admin
  await requireRole(['ADMIN']);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Gestion des Remboursements"
        description="Gérez les demandes et exécution des remboursements"
        actions={
          <Link href="/dashboard/admin/refunds/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Créer un remboursement
            </Button>
          </Link>
        }
      />

      {/* Table des remboursements */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Liste des Remboursements</h2>
        <AdminRefundsTableClient />
      </div>
    </div>
  );
}
