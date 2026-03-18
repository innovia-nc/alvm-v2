import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { InvoicesTableClient } from '@/components/staff/invoices/invoices-table-client';

export default async function StaffInvoicesPage() {
  // Vérifier que l'utilisateur est staff ou admin
  await requireRole(['STAFF', 'ADMIN']);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Facturation"
        description="Gérez toutes les factures et paiements"
        actions={
          <Link href="/dashboard/staff/invoices/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nouvelle facture
            </Button>
          </Link>
        }
      />

      {/* Invoices Table */}
      <InvoicesTableClient />
    </div>
  );
}
