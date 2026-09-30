import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { AdminPaymentsTableClient } from '@/components/admin/payments/admin-payments-table-client';

export default async function AdminPaymentsPage() {
  // Vérifier que l'utilisateur est admin
  await requireRole(['ADMIN']);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Gestion des Paiements"
        description="Consultez tous les paiements reçus"
        actions={
          <Link href="/dashboard/admin/payments/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Enregistrer un paiement
            </Button>
          </Link>
        }
      />

      {/* Table des paiements */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Liste des Paiements</h2>
        <AdminPaymentsTableClient />
      </div>
    </div>
  );
}
