import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/shared/page-header';
import { PaymentForm } from '@/components/admin/payments/payment-form';

export default async function NewPaymentPage() {
  // Vérifier que l'utilisateur est staff ou admin
  await requireRole(['STAFF', 'ADMIN']);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nouveau Paiement"
        description="Enregistrer un nouveau paiement pour une facture"
      />

      <PaymentForm />
    </div>
  );
}
