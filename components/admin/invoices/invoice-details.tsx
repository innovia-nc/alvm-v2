'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  FileText,
  Mail,
  Trash2,
  Loader2,
  Download,
  CheckCircle,
  Clock,
  XCircle,
  AlertTriangle,
  Pencil,
  Send,
} from 'lucide-react';
import { toast } from 'sonner';
import { useDashboardBasePath } from '@/lib/hooks/use-dashboard-base-path';

type Invoice = {
  id: string;
  invoiceNumber: string;
  parentId: string;
  issueDate: Date;
  dueDate: Date;
  subtotalHt?: number;
  taxAmount?: number;
  taxRate?: number;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: 'DRAFT' | 'SENT' | 'PAID' | 'OVERDUE' | 'CANCELLED' | 'CREDITED';
  version: number;
  pdfUrl: string | null;
  parent: {
    firstName: string;
    lastName: string;
    email: string;
    address: string;
    city: string;
    postalCode: string;
  };
  lines: Array<{
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>;
  payments: Array<{
    id: string;
    amount: number;
    paymentDate: Date;
    paymentMethod: string;
  }>;
};

const statusConfig = {
  DRAFT: { label: 'Brouillon', variant: 'secondary' as const, icon: FileText },
  SENT: { label: 'Émise', variant: 'default' as const, icon: Clock },
  PAID: { label: 'Payée', variant: 'outline' as const, icon: CheckCircle },
  OVERDUE: { label: 'En retard', variant: 'destructive' as const, icon: AlertTriangle },
  CANCELLED: { label: 'Annulée', variant: 'outline' as const, icon: XCircle },
  CREDITED: { label: 'Créditée', variant: 'outline' as const, icon: CheckCircle },
};

export function InvoiceDetails({ invoice }: { invoice: Invoice }) {
  const router = useRouter();
  const basePath = useDashboardBasePath();
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  const utils = trpc.useUtils();

  const generatePDFMutation = trpc.invoices.generatePDF.useMutation({
    onSuccess: (data) => {
      toast.success('PDF de la facture généré avec succès');
      utils.invoices.getById.invalidate({ id: invoice.id });
      setIsGeneratingPDF(false);
      router.refresh();

      // Ouvrir le PDF généré si l'URL est retournée
      if (data?.pdfUrl) {
        window.open(data.pdfUrl, '_blank');
      }
    },
    onError: (error) => {
      toast.error(error.message || 'Erreur lors de la génération du PDF');
      setIsGeneratingPDF(false);
    },
  });

  const sendEmailMutation = trpc.invoices.sendEmail.useMutation({
    onSuccess: () => {
      toast.success('Facture envoyée par email au parent');
      utils.invoices.getById.invalidate({ id: invoice.id });
      setIsSendingEmail(false);
      router.refresh();
    },
    onError: (error) => {
      toast.error(error.message || 'Erreur lors de l\'envoi de l\'email');
      setIsSendingEmail(false);
    },
  });

  const validateInvoiceMutation = trpc.invoices.validate.useMutation({
    onSuccess: () => {
      toast.success('Facture validée — elle est maintenant émise');
      utils.invoices.getById.invalidate({ id: invoice.id });
      router.refresh();
    },
    onError: (error) => {
      toast.error(error.message || 'Erreur lors de la validation de la facture');
    },
  });

  const deleteInvoiceMutation = trpc.invoices.delete.useMutation({
    onSuccess: () => {
      toast.success('Facture supprimée avec succès');
      router.push(`${basePath}/invoices`);
      router.refresh();
    },
    onError: (error) => {
      toast.error(error.message || 'Erreur lors de la suppression de la facture');
    },
  });

  const handleDownloadPDF = () => {
    if (invoice.pdfUrl) {
      // Si le PDF existe, télécharger directement
      window.open(invoice.pdfUrl, '_blank');
    } else {
      // Sinon, le générer d'abord
      setIsGeneratingPDF(true);
      generatePDFMutation.mutate({ id: invoice.id });
    }
  };

  const handleSendEmail = () => {
    setIsSendingEmail(true);
    sendEmailMutation.mutate({ id: invoice.id });
  };

  const handleDelete = () => {
    deleteInvoiceMutation.mutate({ id: invoice.id });
  };

  const handleValidate = () => {
    validateInvoiceMutation.mutate({ id: invoice.id });
  };

  const isDraft = invoice.status === 'DRAFT';
  const StatusIcon = statusConfig[invoice.status].icon;

  return (
    <div className="space-y-6">
      {/* Informations générales */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                Facture {invoice.invoiceNumber}
                <Badge variant={statusConfig[invoice.status].variant}>
                  <StatusIcon className="mr-1 h-3 w-3" />
                  {statusConfig[invoice.status].label}
                </Badge>
              </CardTitle>
              <CardDescription>
                Client: {invoice.parent.firstName} {invoice.parent.lastName}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {isDraft && (
                <>
                  <Link href={`${basePath}/invoices/${invoice.id}/edit`}>
                    <Button variant="outline" size="sm">
                      <Pencil className="mr-2 h-4 w-4" />
                      Modifier
                    </Button>
                  </Link>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="default"
                        size="sm"
                        disabled={validateInvoiceMutation.isPending}
                      >
                        {validateInvoiceMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="mr-2 h-4 w-4" />
                        )}
                        Valider la facture
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Valider la facture ?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Une fois validée, la facture passera en statut "Émise" et ne pourra plus être modifiée.
                          Les écritures comptables seront générées.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction onClick={handleValidate}>
                          Valider
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadPDF}
                disabled={isGeneratingPDF}
              >
                {isGeneratingPDF ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Télécharger PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSendEmail}
                disabled={isSendingEmail || invoice.status === 'DRAFT'}
              >
                {isSendingEmail ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="mr-2 h-4 w-4" />
                )}
                Envoyer par email
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Supprimer
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
                    <AlertDialogDescription>
                      Êtes-vous sûr de vouloir supprimer cette facture? Cette action est irréversible.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete}>
                      Supprimer
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold mb-2">Informations client</h4>
              <p className="text-sm text-muted-foreground">
                {invoice.parent.firstName} {invoice.parent.lastName}
              </p>
              <p className="text-sm text-muted-foreground">{invoice.parent.email}</p>
              <p className="text-sm text-muted-foreground">{invoice.parent.address}</p>
              <p className="text-sm text-muted-foreground">
                {invoice.parent.postalCode} {invoice.parent.city}
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">Dates et montants</h4>
              <div className="space-y-1">
                <p className="text-sm">
                  <span className="text-muted-foreground">Date d'émission: </span>
                  {new Date(invoice.issueDate).toLocaleDateString('fr-FR')}
                </p>
                <p className="text-sm">
                  <span className="text-muted-foreground">Date d'échéance: </span>
                  {new Date(invoice.dueDate).toLocaleDateString('fr-FR')}
                </p>
                {invoice.subtotalHt !== undefined && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">Montant HT: </span>
                    <span className="font-semibold">{invoice.subtotalHt.toLocaleString('fr-FR')} XPF</span>
                  </p>
                )}
                {invoice.taxAmount !== undefined && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">Taxes ({(invoice.taxRate ?? 0) * 100}%): </span>
                    <span className="font-semibold">{invoice.taxAmount.toLocaleString('fr-FR')} XPF</span>
                  </p>
                )}
                <p className="text-sm">
                  <span className="text-muted-foreground">Montant total TTC: </span>
                  <span className="font-semibold">{invoice.totalAmount.toLocaleString('fr-FR')} XPF</span>
                </p>
                <p className="text-sm">
                  <span className="text-muted-foreground">Montant payé: </span>
                  <span className="font-semibold">{invoice.paidAmount.toLocaleString('fr-FR')} XPF</span>
                </p>
                <p className="text-sm">
                  <span className="text-muted-foreground">Reste à payer: </span>
                  <span className="font-semibold">{invoice.remainingAmount.toLocaleString('fr-FR')} XPF</span>
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lignes de facture */}
      <Card>
        <CardHeader>
          <CardTitle>Détails de facturation</CardTitle>
        </CardHeader>
        <CardContent>
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
              {invoice.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>{line.description}</TableCell>
                  <TableCell className="text-right">{line.quantity}</TableCell>
                  <TableCell className="text-right">
                    {line.unitPrice.toLocaleString('fr-FR')} XPF
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {line.totalPrice.toLocaleString('fr-FR')} XPF
                  </TableCell>
                </TableRow>
              ))}
              {invoice.subtotalHt !== undefined && (
                <TableRow>
                  <TableCell colSpan={3} className="text-right">
                    Sous-total HT
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {invoice.subtotalHt.toLocaleString('fr-FR')} XPF
                  </TableCell>
                </TableRow>
              )}
              {invoice.taxAmount !== undefined && (
                <TableRow>
                  <TableCell colSpan={3} className="text-right">
                    Taxes ({(invoice.taxRate ?? 0) * 100}%)
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {invoice.taxAmount.toLocaleString('fr-FR')} XPF
                  </TableCell>
                </TableRow>
              )}
              <TableRow>
                <TableCell colSpan={3} className="text-right font-semibold">
                  Total TTC
                </TableCell>
                <TableCell className="text-right font-bold">
                  {invoice.totalAmount.toLocaleString('fr-FR')} XPF
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Paiements */}
      {invoice.payments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Paiements</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Méthode</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>
                      {new Date(payment.paymentDate).toLocaleDateString('fr-FR')}
                    </TableCell>
                    <TableCell>{payment.paymentMethod}</TableCell>
                    <TableCell className="text-right font-medium">
                      {payment.amount.toLocaleString()} XPF
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`${basePath}/payments/${payment.id}`}>
                        <Button variant="ghost" size="sm">
                          Voir
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Bouton d'ajout de paiement si montant restant */}
      {invoice.remainingAmount > 0 && invoice.status !== 'CANCELLED' && invoice.status !== 'DRAFT' && (
        <div className="flex justify-end">
          <Link href={`${basePath}/payments/new?invoiceId=${invoice.id}`}>
            <Button>
              Enregistrer un paiement
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
