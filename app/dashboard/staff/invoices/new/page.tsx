import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/shared/page-header';
import { InvoiceForm } from '@/components/admin/invoices/invoice-form';

export default async function NewInvoicePage() {
  // Vérifier que l'utilisateur est staff ou admin
  await requireRole(['STAFF', 'ADMIN']);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nouvelle Facture"
        description="Créez une nouvelle facture pour un parent"
      />

      <InvoiceForm />
    </div>
  );
}
