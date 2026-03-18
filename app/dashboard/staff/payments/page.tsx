import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { PaymentsTableClient } from '@/components/staff/payments/payments-table-client';

export default async function StaffPaymentsPage() {
  // Vérifier que l'utilisateur est staff ou admin
  await requireRole(['STAFF', 'ADMIN']);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Paiements Reçus"
        description="Consultez l'historique des paiements"
        actions={
          <Link href="/dashboard/staff/payments/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nouveau paiement
            </Button>
          </Link>
        }
      />

      {/* Payments Table */}
      <PaymentsTableClient />
    </div>
  );
}
