import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth/config';
import { createServerTRPC } from '@/lib/trpc';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import {
  Download,
  Calendar,
  User,
  MapPin,
  DollarSign,
  CreditCard,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import Link from 'next/link';

// ============================================================================
// METADATA
// ============================================================================

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const trpc = await createServerTRPC();
  const invoice = await trpc.invoices.getById({ id });

  if (!invoice) {
    return {
      title: 'Facture non trouvée | Mikado',
    };
  }

  return {
    title: `Facture ${invoice.invoiceNumber} | Mikado`,
    description: `Facture émise le ${formatDate(invoice.issueDate)}`,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const getStatusVariant = (status: string) => {
  switch (status) {
    case 'PAID':
      return 'default' as const;
    case 'SENT':
      return 'secondary' as const;
    case 'OVERDUE':
      return 'destructive' as const;
    case 'CANCELLED':
      return 'outline' as const;
    case 'DRAFT':
      return 'outline' as const;
    default:
      return 'secondary' as const;
  }
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case 'PAID':
      return 'Payée';
    case 'SENT':
      return 'Envoyée';
    case 'OVERDUE':
      return 'En retard';
    case 'CANCELLED':
      return 'Annulée';
    case 'DRAFT':
      return 'Brouillon';
    default:
      return status;
  }
};

// ============================================================================
// PAGE COMPONENT
// ============================================================================

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  if (!session?.user || session.user.role !== 'PARENT') {
    redirect('/auth/signin');
  }

  const trpc = await createServerTRPC();
  const invoice = await trpc.invoices.getById({ id });

  // Invoice not found or not accessible
  if (!invoice) {
    notFound();
  }

  const isPaid = invoice.status === 'PAID';
  const isOverdue = invoice.status === 'OVERDUE';
  const canPay = invoice.status === 'SENT' || invoice.status === 'OVERDUE';
  const lastPayment = invoice.payments && invoice.payments.length > 0
    ? invoice.payments[invoice.payments.length - 1]
    : null;

  return (
    <div className="space-y-6">
      {/* Header with back button */}
      <PageHeader
        title={`Facture ${invoice.invoiceNumber}`}
        description={`Émise le ${formatDate(invoice.issueDate)}`}
        actions={
          <Link href="/dashboard/parent/invoices">
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour
            </Button>
          </Link>
        }
      />

      {/* Status and alerts */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge variant={getStatusVariant(invoice.status)} className="text-base px-3 py-1">
            {getStatusLabel(invoice.status)}
          </Badge>
        </div>

        {isPaid && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              Cette facture a été payée intégralement
              {lastPayment && (
                <> le {formatDate(lastPayment.paymentDate)}</>
              )}
            </AlertDescription>
          </Alert>
        )}

        {isOverdue && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Cette facture est en retard. L'échéance était le {formatDate(invoice.dueDate)}
            </AlertDescription>
          </Alert>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main content - 2 columns */}
        <div className="lg:col-span-2 space-y-6">
          {/* Invoice lines */}
          <Card>
            <CardHeader>
              <CardTitle>Détails de la facture</CardTitle>
              <CardDescription>
                {invoice.lines?.length || 0} ligne{(invoice.lines?.length || 0) > 1 ? 's' : ''}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!invoice.lines || invoice.lines.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucune ligne de facturation
                </p>
              ) : (
                <div className="space-y-4">
                  {/* Table header */}
                  <div className="hidden md:grid md:grid-cols-12 gap-4 text-sm font-medium text-muted-foreground border-b pb-2">
                    <div className="col-span-6">Description</div>
                    <div className="col-span-2 text-right">Qté</div>
                    <div className="col-span-2 text-right">Prix unit.</div>
                    <div className="col-span-2 text-right">Total</div>
                  </div>

                  {/* Table rows */}
                  {invoice.lines.map((line, index) => (
                    <div key={line.id}>
                      {index > 0 && <Separator className="my-3" />}
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4">
                        <div className="md:col-span-6">
                          <p className="font-medium">{line.description}</p>
                          {line.registrationId && (
                            <Link
                              href={`/dashboard/parent/registrations/${line.registrationId}`}
                              className="text-xs text-primary hover:underline"
                            >
                              Voir l'inscription →
                            </Link>
                          )}
                        </div>
                        <div className="md:col-span-2 md:text-right">
                          <span className="text-sm md:hidden text-muted-foreground">Quantité : </span>
                          <span className="text-sm">{line.quantity}</span>
                        </div>
                        <div className="md:col-span-2 md:text-right">
                          <span className="text-sm md:hidden text-muted-foreground">Prix unitaire : </span>
                          <span className="text-sm">{line.unitPrice.toLocaleString('fr-FR')} XPF</span>
                        </div>
                        <div className="md:col-span-2 md:text-right">
                          <span className="text-sm md:hidden text-muted-foreground">Total : </span>
                          <span className="font-medium">{line.totalPrice.toLocaleString('fr-FR')} XPF</span>
                        </div>
                      </div>
                    </div>
                  ))}

                  <Separator className="my-4" />

                  {/* Total */}
                  <div className="flex justify-between items-center text-lg font-bold">
                    <span>Total TTC</span>
                    <span className="text-2xl text-primary">
                      {invoice.totalAmount.toLocaleString('fr-FR')} XPF
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payment history */}
          {invoice.payments && invoice.payments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Historique des paiements</CardTitle>
                <CardDescription>
                  {invoice.payments.length} paiement{invoice.payments.length > 1 ? 's' : ''} enregistré{invoice.payments.length > 1 ? 's' : ''}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {invoice.payments.map((payment, index) => (
                    <div key={payment.id}>
                      {index > 0 && <Separator className="my-3" />}
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <CreditCard className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">
                              {payment.amount.toLocaleString('fr-FR')} XPF
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {payment.paymentMethod} • {formatDate(payment.paymentDate)}
                            </p>
                          </div>
                        </div>
                        <Badge variant="outline">Payé</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar - 1 column */}
        <div className="space-y-6">
          {/* Parent info */}
          <Card>
            <CardHeader>
              <CardTitle>Informations client</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-3">
                <User className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium">
                    {invoice.parent.firstName} {invoice.parent.lastName}
                  </p>
                  <p className="text-sm text-muted-foreground">{invoice.parent.email}</p>
                </div>
              </div>
              <Separator />
              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="flex-1 text-sm text-muted-foreground">
                  <p>{invoice.parent.address}</p>
                  <p>
                    {invoice.parent.postalCode} {invoice.parent.city}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payment status */}
          <Card>
            <CardHeader>
              <CardTitle>État du paiement</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Montant total</span>
                <span className="font-medium">
                  {invoice.totalAmount.toLocaleString('fr-FR')} XPF
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Déjà payé</span>
                <span className="font-medium text-green-600">
                  {invoice.paidAmount.toLocaleString('fr-FR')} XPF
                </span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="font-semibold">Reste à payer</span>
                <span className={`text-xl font-bold ${invoice.remainingAmount > 0 ? 'text-destructive' : 'text-green-600'}`}>
                  {invoice.remainingAmount.toLocaleString('fr-FR')} XPF
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Invoice dates */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dates importantes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-3">
                <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div className="flex-1 text-sm">
                  <p className="font-medium">Date d'émission</p>
                  <p className="text-muted-foreground">{formatDate(invoice.issueDate)}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div className="flex-1 text-sm">
                  <p className="font-medium">Date d'échéance</p>
                  <p className={`${isOverdue ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                    {formatDate(invoice.dueDate)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {invoice.pdfUrl && (
                <Button variant="outline" className="w-full" asChild>
                  <a href={invoice.pdfUrl} target="_blank" rel="noopener noreferrer">
                    <Download className="mr-2 h-4 w-4" />
                    Télécharger PDF
                  </a>
                </Button>
              )}
              {canPay && invoice.remainingAmount > 0 && (
                <Button className="w-full">
                  <DollarSign className="mr-2 h-4 w-4" />
                  Payer maintenant
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
