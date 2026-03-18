import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/shared/page-header';
import { RefundForm } from '@/components/admin/refunds/refund-form';

export default async function NewRefundPage() {
  // Vérifier que l'utilisateur est admin
  await requireRole(['ADMIN']);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Nouveau Remboursement"
        description="Enregistrer un nouveau remboursement pour un paiement"
      />

      <RefundForm />
    </div>
  );
}
