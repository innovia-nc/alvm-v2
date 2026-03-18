import { requireRole } from '@/lib/auth';
import { createServerTRPC } from '@/lib/trpc';
import { PageHeader } from '@/components/shared/page-header';
import { notFound } from 'next/navigation';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { BreadcrumbProvider } from '@/components/layout/breadcrumb-provider';
import Link from 'next/link';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function StaffCreditNoteDetailsPage({ params }: PageProps) {
  await requireRole(['STAFF', 'ADMIN']);
  const { id } = await params;
  const trpc = await createServerTRPC();

  const creditNote = await trpc.creditNotes.getById({ id });

  if (!creditNote) {
    notFound();
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return {
          label: 'Brouillon',
          className: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
        };
      case 'SENT':
        return {
          label: 'Émis',
          className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
        };
      case 'CANCELLED':
        return {
          label: 'Annulé',
          className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
        };
      default:
        return { label: status, className: '' };
    }
  };

  const statusInfo = getStatusBadge(creditNote.status);

  return (
    <BreadcrumbProvider
      items={[
        { href: '/dashboard/staff', label: 'Espace Personnel' },
        { href: '/dashboard/staff/credit-notes', label: 'Avoirs' },
        { label: creditNote.creditNoteNumber }
      ]}
    >
      <div className="space-y-6">
        <PageHeader
          title={`Avoir ${creditNote.creditNoteNumber}`}
          description="Détails de la note de crédit"
        />

      <div className="grid gap-6 md:grid-cols-2">
        {/* Informations générales */}
        <Card>
          <CardHeader>
            <CardTitle>Informations Générales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm text-muted-foreground">Numéro d'avoir</div>
              <div className="font-medium">{creditNote.creditNoteNumber}</div>
            </div>

            <div>
              <div className="text-sm text-muted-foreground">Date d'émission</div>
              <div className="font-medium">
                {new Date(creditNote.issueDate).toLocaleDateString('fr-FR')}
              </div>
            </div>

            <div>
              <div className="text-sm text-muted-foreground">Statut</div>
              <Badge className={statusInfo.className}>{statusInfo.label}</Badge>
            </div>

            <div>
              <div className="text-sm text-muted-foreground">Montant total</div>
              <div className="text-lg font-semibold text-red-600">
                -{parseFloat(creditNote.totalAmount.toString()).toLocaleString('fr-FR')} XPF
              </div>
            </div>

            {creditNote.originalInvoice && (
              <div>
                <div className="text-sm text-muted-foreground">Facture concernée</div>
                <Link
                  href={`/dashboard/staff/invoices/${creditNote.creditedInvoiceId}`}
                  className="font-medium text-blue-600 hover:underline"
                >
                  {creditNote.originalInvoice.invoiceNumber}
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Client */}
        <Card>
          <CardHeader>
            <CardTitle>Client</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm text-muted-foreground">Nom complet</div>
              <div className="font-medium">
                {creditNote.parent.firstName} {creditNote.parent.lastName}
              </div>
            </div>

            <div>
              <div className="text-sm text-muted-foreground">Email</div>
              <div className="font-medium">{creditNote.parent.email}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      {creditNote.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg bg-muted p-4">
              <p className="text-sm leading-relaxed">{creditNote.notes}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lignes */}
      <Card>
        <CardHeader>
          <CardTitle>Détails des Lignes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Quantité</TableHead>
                  <TableHead className="text-right">Prix unitaire</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {creditNote.lines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell>{line.description}</TableCell>
                    <TableCell className="text-right">{line.quantity}</TableCell>
                    <TableCell className="text-right">
                      {parseFloat(line.unitPrice.toString()).toLocaleString('fr-FR')} XPF
                    </TableCell>
                    <TableCell className="text-right font-medium text-red-600">
                      -{parseFloat(line.totalHt.toString()).toLocaleString('fr-FR')} XPF
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={3} className="text-right font-semibold">
                    Total de l'avoir
                  </TableCell>
                  <TableCell className="text-right text-lg font-bold text-red-600">
                    -{parseFloat(creditNote.totalAmount.toString()).toLocaleString('fr-FR')} XPF
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      </div>
    </BreadcrumbProvider>
  );
}
