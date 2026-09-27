import { ParentRecordCard } from '@/components/parent/parent-record-card';
import { ParentStatusFilters } from '@/components/parent/parent-status-filters';
import { EmptyState } from '@/components/shared/empty-state';
import { ListPagination } from '@/components/shared/list-pagination';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { auth } from '@/lib/auth/config';
import { createServerTRPC } from '@/lib/trpc';
import { Download, FileText } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

/**
 * Parent Invoices Page
 * Displays all invoices for the parent
 */
export default async function ParentInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const session = await auth();

  if (!session?.user || session.user.role !== 'PARENT') {
    redirect('/auth/signin');
  }

  const page = Math.max(1, Math.floor(Number((await searchParams).page) || 1));
  const requestedStatus = (await searchParams).status;
  const status =
    requestedStatus === 'OVERDUE' || requestedStatus === 'PAID' || requestedStatus === 'SENT'
      ? requestedStatus
      : undefined;
  const trpc = await createServerTRPC();

  // Get invoices
  const invoicesData = await trpc.invoices.list.query({ limit: 20, offset: (page - 1) * 20, status });
  const invoices = invoicesData.invoices;

  return (
    <div className="space-y-6">
      <PageHeader title="Mes factures" description="Consultez et téléchargez vos factures" />

      <ParentStatusFilters
        basePath="/dashboard/parent/invoices"
        value={status}
        options={[
          { label: 'Toutes' },
          { value: 'SENT', label: 'Émises' },
          { value: 'OVERDUE', label: 'En retard' },
          { value: 'PAID', label: 'Payées' },
        ]}
      />
      {invoices.length === 0 ? (
        <EmptyState
          title={status ? 'Aucune facture pour ce statut' : 'Aucune facture'}
          description={
            status
              ? 'Choisissez un autre statut pour retrouver vos factures.'
              : 'Vos factures apparaîtront ici après leur émission.'
          }
          icon={FileText}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {invoices.map((invoice) => (
            <ParentRecordCard
              key={invoice.id}
              title={`Facture ${invoice.invoiceNumber}`}
              href={`/dashboard/parent/invoices/${invoice.id}`}
              status={<StatusBadge type="invoice" status={invoice.status} />}
              description={`Émise le ${invoice.issueDate.toLocaleDateString('fr-FR', { timeZone: 'Pacific/Noumea' })}`}
              summary={
                <>
                  {invoice.totalAmount.toLocaleString('fr-FR')} XPF{' '}
                  <span className="text-sm font-normal text-muted-foreground">au total</span>
                </>
              }
              actions={
                <>
                  <Button asChild>
                    <Link href={`/dashboard/parent/invoices/${invoice.id}`}>Voir la facture</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <a
                      href={`/api/documents/invoice/${invoice.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Download className="h-4 w-4" /> Télécharger PDF
                    </a>
                  </Button>
                </>
              }
            >
              <p>
                Échéance :{' '}
                {invoice.dueDate.toLocaleDateString('fr-FR', { timeZone: 'Pacific/Noumea' })}
              </p>
              {(invoice.status === 'SENT' || invoice.status === 'OVERDUE') && (
                <Link
                  className="inline-block font-medium text-primary hover:underline"
                  href={`/dashboard/parent/invoices/${invoice.id}#reglement`}
                >
                  Comment régler cette facture ?
                </Link>
              )}
            </ParentRecordCard>
          ))}
        </div>
      )}
      <ListPagination
        page={page}
        total={invoicesData.total}
        basePath={`/dashboard/parent/invoices${status ? `?status=${status}` : ''}`}
      />
    </div>
  );
}
