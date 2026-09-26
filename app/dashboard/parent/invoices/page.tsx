import { EmptyState } from '@/components/shared/empty-state';
import { ListPagination } from '@/components/shared/list-pagination';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { auth } from '@/lib/auth/config';
import { createServerTRPC } from '@/lib/trpc';
import { DollarSign, Download, Eye, FileText } from 'lucide-react';
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
  const status = (await searchParams).status === 'OVERDUE' ? ('OVERDUE' as const) : undefined;
  const trpc = await createServerTRPC();

  // Get invoices
  const invoicesData = await trpc.invoices.list({ limit: 20, offset: (page - 1) * 20, status });
  const invoices = invoicesData.invoices;

  return (
    <div className="space-y-6">
      <PageHeader title="Mes factures" description="Consultez et téléchargez vos factures" />

      {invoices.length === 0 ? (
        <EmptyState
          title="Aucune facture"
          description={
            <>Vous n'avez pas encore de factures. Elles apparaîtront ici après une inscription.</>
          }
          icon={FileText}
        />
      ) : (
        <div className="space-y-4">
          {invoices.map((invoice) => (
            <Card key={invoice.id}>
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <CardTitle className="break-words text-lg">
                        Facture #{invoice.invoiceNumber}
                      </CardTitle>
                      <StatusBadge type="invoice" status={invoice.status} />
                    </div>
                    <CardDescription className="mt-1">
                      Émise le{' '}
                      {new Date(invoice.createdAt).toLocaleDateString('fr-FR', {
                        timeZone: 'Pacific/Noumea',
                      })}
                      {invoice.dueDate && (
                        <>
                          {' '}
                          • Échéance :{' '}
                          {new Date(invoice.dueDate).toLocaleDateString('fr-FR', {
                            timeZone: 'Pacific/Noumea',
                          })}
                        </>
                      )}
                    </CardDescription>
                  </div>
                  <div className="sm:text-right">
                    <div className="text-2xl font-bold">
                      {invoice.totalAmount.toLocaleString('fr-FR')} XPF
                    </div>
                    {invoice.status === 'PAID' && (
                      <div className="text-sm text-green-600">Payée</div>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/dashboard/parent/invoices/${invoice.id}`}>
                      <Eye className="mr-2 h-4 w-4" />
                      Voir le détail
                    </Link>
                  </Button>
                  {invoice.pdfUrl ? (
                    <Button asChild variant="outline" size="sm">
                      <a href={invoice.pdfUrl} target="_blank" rel="noopener noreferrer">
                        <Download className="mr-2 h-4 w-4" />
                        Télécharger PDF
                      </a>
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" disabled>
                      <Download className="mr-2 h-4 w-4" />
                      PDF non disponible
                    </Button>
                  )}
                  {invoice.status === 'SENT' && (
                    <Button size="sm" className="ml-auto">
                      <DollarSign className="mr-2 h-4 w-4" />
                      Payer maintenant
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
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
