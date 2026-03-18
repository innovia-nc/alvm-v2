import { requireRole } from '@/lib/auth';
import { createServerTRPC } from '@/lib/trpc';
import { PageHeader } from '@/components/shared/page-header';
import { PaymentDetails } from '@/components/admin/payments/payment-details';
import { notFound } from 'next/navigation';

export default async function PaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Vérifier que l'utilisateur est staff ou admin
  await requireRole(['STAFF', 'ADMIN']);

  const { id } = await params;

  // Créer le client tRPC server-side
  const trpc = await createServerTRPC();

  // Récupérer le paiement
  const payment = await trpc.payments.getById({ id });

  if (!payment) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Détails du Paiement"
        description={`Enregistré le ${new Date(payment.paymentDate).toLocaleDateString('fr-FR')}`}
      />

      <PaymentDetails payment={payment} />
    </div>
  );
}
