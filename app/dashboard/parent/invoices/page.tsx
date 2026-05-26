import { auth } from '@/lib/auth/config';
import { redirect } from 'next/navigation';
import { createServerTRPC } from '@/lib/trpc';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status-badge';
import { FileText, Download, Eye, DollarSign } from 'lucide-react';
import Link from 'next/link';

/**
 * Parent Invoices Page
 * Displays all invoices for the parent
 */
export default async function ParentInvoicesPage() {
  const session = await auth();

  if (!session?.user || session.user.role !== 'PARENT') {
    redirect('/auth/signin');
  }

  const trpc = await createServerTRPC();

  // Get invoices
  const invoicesData = await trpc.invoices.list({ limit: 100, offset: 0 });
  const invoices = invoicesData.invoices;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mes factures"
        description="Consultez et téléchargez vos factures"
      />

      {invoices.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <FileText className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-lg font-medium text-gray-900">Aucune facture</h3>
              <p className="mt-1 text-sm text-gray-500">
                Vous n'avez pas encore de factures. Elles apparaîtront ici après une inscription.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {invoices.map((invoice) => (
            <Card key={invoice.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <CardTitle className="text-lg">
                        Facture #{invoice.invoiceNumber}
                      </CardTitle>
                      <StatusBadge type="invoice" status={invoice.status} />
                    </div>
                    <CardDescription className="mt-1">
                      Émise le {new Date(invoice.createdAt).toLocaleDateString('fr-FR')}
                      {invoice.dueDate && (
                        <> • Échéance : {new Date(invoice.dueDate).toLocaleDateString('fr-FR')}</>
                      )}
                    </CardDescription>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold">
                      {invoice.totalAmount.toLocaleString('fr-FR')} XPF
                    </div>
                    {invoice.status === 'PAID' && (
                      <div className="text-sm text-green-600">
                        Payée
                      </div>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
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
    </div>
  );
}
