import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/shared/page-header';
import { RefundForm } from '@/components/admin/refunds/refund-form';

export default async function NewRefundPage() {
  // Vérifier que l'utilisateur est staff ou admin
  await requireRole(['STAFF', 'ADMIN']);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nouveau Remboursement"
        description="Enregistrer un nouveau remboursement pour un paiement"
      />

      <RefundForm />
    </div>
  );
}
