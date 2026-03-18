import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { RefundsTableClient } from '@/components/staff/refunds/refunds-table-client';

export default async function StaffRefundsPage() {
  // Vérifier que l'utilisateur est staff ou admin
  await requireRole(['STAFF', 'ADMIN']);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Remboursements"
        description="Consultez l'historique des remboursements"
        actions={
          <Link href="/dashboard/staff/refunds/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nouveau remboursement
            </Button>
          </Link>
        }
      />

      {/* Refunds Table */}
      <RefundsTableClient />
    </div>
  );
}
