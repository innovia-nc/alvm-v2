import { requireRole } from '@/lib/auth';
import { createServerTRPC } from '@/lib/trpc';
import { PageHeader } from '@/components/shared/page-header';
import { RefundDetails } from '@/components/admin/refunds/refund-details';
import { notFound } from 'next/navigation';

export default async function RefundDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Vérifier que l'utilisateur est admin
  await requireRole(['ADMIN']);

  const { id } = await params;

  // Créer le client tRPC server-side
  const trpc = await createServerTRPC();

  // Récupérer le remboursement
  const refund = await trpc.refunds.getById({ id });

  if (!refund) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Détails du Remboursement"
        description={`Effectué le ${new Date(refund.refundDate).toLocaleDateString('fr-FR')}`}
      />

      <RefundDetails refund={refund} />
    </div>
  );
}
