import { requireRole } from '@/lib/auth';
import { createServerTRPC } from '@/lib/trpc';
import { PageHeader } from '@/components/shared/page-header';
import { InvoiceDetails } from '@/components/admin/invoices/invoice-details';
import { notFound } from 'next/navigation';

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Vérifier que l'utilisateur est admin
  await requireRole(['ADMIN']);

  const { id } = await params;

  // Créer le client tRPC server-side
  const trpc = await createServerTRPC();

  // Récupérer la facture
  const invoice = await trpc.invoices.getById({ id });

  if (!invoice) {
    notFound();
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Facture ${invoice.invoiceNumber}`}
        description={`Émise le ${new Date(invoice.issueDate).toLocaleDateString('fr-FR')}`}
      />

      <InvoiceDetails invoice={invoice} />
    </div>
  );
}
