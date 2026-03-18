import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { AdminInvoicesTableClient } from '@/components/admin/invoices/admin-invoices-table-client';

export default async function AdminInvoicesPage() {
  // Vérifier que l'utilisateur est admin
  await requireRole(['ADMIN']);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestion des Factures"
        description="Consultez et gérez toutes les factures"
        actions={
          <Link href="/dashboard/admin/invoices/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nouvelle facture
            </Button>
          </Link>
        }
      />

      <AdminInvoicesTableClient />
    </div>
  );
}
