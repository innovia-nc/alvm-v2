import { requireRole } from '@/lib/auth';
import { createServerTRPC } from '@/lib/trpc';
import { PageHeader } from '@/components/shared/page-header';
import { InvoiceEditForm } from '@/components/admin/invoices/invoice-edit-form';
import { notFound, redirect } from 'next/navigation';

export default async function InvoiceEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(['ADMIN']);

  const { id } = await params;
  const trpc = await createServerTRPC();
  const invoice = await trpc.invoices.getById({ id });

  if (!invoice) notFound();
  if (invoice.status !== 'DRAFT') {
    redirect(`/dashboard/admin/invoices/${id}`);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Modifier la facture ${invoice.invoiceNumber}`}
        description="Vous pouvez modifier les lignes tant que la facture n'a pas été validée"
      />

      <InvoiceEditForm
        invoice={{
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          status: invoice.status,
          dueDate: invoice.dueDate,
          taxRate: invoice.taxRate,
          parent: {
            firstName: invoice.parent.firstName,
            lastName: invoice.parent.lastName,
            email: invoice.parent.email,
          },
          lines: invoice.lines.map((l) => ({
            id: l.id,
            registrationId: l.registrationId,
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
          })),
        }}
        version={invoice.version}
      />
    </div>
  );
}
