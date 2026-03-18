'use client';

import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { trpc } from '@/lib/trpc/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { LoadingButton } from '@/components/ui/loading-button';
import { toast } from 'sonner';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PaymentMethodSelect } from '@/components/shared/payment-method-select';

// ============================================================================
// SCHEMAS
// ============================================================================

const paymentFormSchema = z
  .object({
    invoiceId: z.string().min(1, 'Facture requise'),
    amount: z.number().min(0.01, 'Montant doit être positif'),
    paymentDate: z.string().min(1, 'Date requise'),
    paymentMethodId: z.string().uuid('Méthode de paiement requise'),
    creditNoteId: z.string().optional(),
    reference: z.string().optional(),
    notes: z.string().optional(),
  });

type PaymentFormValues = z.infer<typeof paymentFormSchema>;

// ============================================================================
// TYPES
// ============================================================================

interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  invoiceId?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function PaymentDialog({ open, onOpenChange, onSuccess, invoiceId: propsInvoiceId }: PaymentDialogProps) {
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);

  // Form
  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      invoiceId: '',
      amount: 0,
      paymentDate: new Date().toISOString().split('T')[0]!,
      paymentMethodId: '',
      creditNoteId: '',
      reference: '',
      notes: '',
    },
  });

  // Pré-remplir la facture si fournie en prop
  useEffect(() => {
    if (propsInvoiceId && open) {
      form.setValue('invoiceId', propsInvoiceId);
    }
  }, [propsInvoiceId, open, form]);

  const paymentMethodId = form.watch('paymentMethodId');
  const invoiceId = form.watch('invoiceId');

  // Fetch payment methods
  const { data: paymentMethods } = trpc.paymentMethods.list.useQuery();

  // Get selected payment method to check if it's CREDIT_NOTE
  const selectedPaymentMethod = paymentMethods?.find(pm => pm.id === paymentMethodId);
  const isCreditNoteMethod = selectedPaymentMethod?.code === 'CREDIT_NOTE';

  // Récupérer les factures impayées
  const { data: invoicesData } = trpc.invoices.list.useQuery({
    limit: 100,
    offset: 0,
  });

  // Filtrer uniquement factures SENT ou OVERDUE avec reste à payer
  const unpaidInvoices = useMemo(
    () =>
      invoicesData?.invoices.filter(
        (inv) =>
          (inv.status === 'SENT' || inv.status === 'OVERDUE') &&
          inv.totalAmount > inv.paidAmount
      ) || [],
    [invoicesData]
  );

  // Récupérer les avoirs disponibles pour le parent sélectionné
  const { data: creditNotesData } = trpc.creditNotes.list.useQuery(
    {
      parentId: selectedParentId!,
      status: 'SENT',
      limit: 100,
      offset: 0,
      sortBy: 'issueDate',
      sortOrder: 'desc'
    },
    { enabled: !!selectedParentId && isCreditNoteMethod }
  );
  const creditNotes = useMemo(
    () => creditNotesData?.creditNotes.filter(cn => cn.status === 'SENT'),
    [creditNotesData]
  );

  // Mutation pour créer le paiement
  const createPayment = trpc.payments.create.useMutation({
    onSuccess: () => {
      toast.success('Paiement enregistré', {
        description: 'Le paiement a été enregistré avec succès.',
      });
      form.reset();
      setSelectedInvoice(null);
      setSelectedParentId(null);
      onSuccess?.();
    },
    onError: (error) => {
      toast.error('Erreur lors de l\'enregistrement', {
        description: error.message,
      });
    },
  });

  // Mettre à jour le parent quand la facture change
  useEffect(() => {
    if (invoiceId) {
      const invoice = unpaidInvoices.find((inv) => inv.id === invoiceId);
      if (invoice) {
        setSelectedInvoice(invoiceId);
        setSelectedParentId(invoice.parentId);

        // Auto-remplir le montant avec le reste à payer
        const remaining = invoice.totalAmount - invoice.paidAmount;
        form.setValue('amount', remaining);
      }
    }
  }, [invoiceId, unpaidInvoices, form]);

  // Reset creditNoteId si on change de méthode
  useEffect(() => {
    if (!isCreditNoteMethod) {
      form.setValue('creditNoteId', '');
    }
  }, [isCreditNoteMethod, form]);

  // Récupérer les infos de la facture sélectionnée
  const selectedInvoiceData = unpaidInvoices.find((inv) => inv.id === selectedInvoice);
  const remainingAmount = selectedInvoiceData
    ? selectedInvoiceData.totalAmount - selectedInvoiceData.paidAmount
    : 0;

  // Récupérer les infos de l'avoir sélectionné
  const selectedCreditNoteId = form.watch('creditNoteId');
  const selectedCreditNote = creditNotes?.find((cn: { id: string; creditNoteNumber: string; totalAmount: number; issueDate: Date }) => cn.id === selectedCreditNoteId);

  // Validation du montant
  const amount = form.watch('amount');
  const isAmountValid = amount > 0 && amount <= remainingAmount;
  const isCreditNoteAmountValid =
    !isCreditNoteMethod ||
    !selectedCreditNote ||
    amount <= Math.abs(selectedCreditNote.totalAmount);

  const onSubmit = (values: PaymentFormValues) => {
    createPayment.mutate({
      invoiceId: values.invoiceId,
      amount: values.amount,
      paymentDate: values.paymentDate,
      paymentMethodId: values.paymentMethodId,
      creditNoteId: values.creditNoteId || undefined,
      reference: values.reference || undefined,
      notes: values.notes || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enregistrer un paiement</DialogTitle>
          <DialogDescription>
            Saisissez les informations du paiement reçu
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Sélection de la facture */}
            <FormField
              control={form.control}
              name="invoiceId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Facture *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionnez une facture" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {unpaidInvoices.map((invoice) => {
                        const remaining = invoice.totalAmount - invoice.paidAmount;
                        return (
                          <SelectItem key={invoice.id} value={invoice.id}>
                            #{invoice.invoiceNumber} - {invoice.parent.firstName}{' '}
                            {invoice.parent.lastName} - Reste à payer:{' '}
                            {remaining.toLocaleString()} XPF
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Infos facture sélectionnée */}
            {selectedInvoiceData && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Facture #{selectedInvoiceData.invoiceNumber}</strong>
                  <br />
                  Montant total: {selectedInvoiceData.totalAmount.toLocaleString()} XPF
                  <br />
                  Déjà payé: {selectedInvoiceData.paidAmount.toLocaleString()} XPF
                  <br />
                  <strong>Reste à payer: {remainingAmount.toLocaleString()} XPF</strong>
                </AlertDescription>
              </Alert>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              {/* Montant */}
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Montant (XPF) *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    {!isAmountValid && amount > 0 && (
                      <p className="text-sm text-destructive">
                        Le montant ne peut pas dépasser {remainingAmount.toLocaleString()} XPF
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Date de paiement */}
              <FormField
                control={form.control}
                name="paymentDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date de paiement *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Méthode de paiement */}
            <FormField
              control={form.control}
              name="paymentMethodId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Méthode de paiement *</FormLabel>
                  <FormControl>
                    <PaymentMethodSelect
                      value={field.value}
                      onValueChange={field.onChange}
                      excludeCreditNote={false}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Sélection avoir si méthode = CREDIT_NOTE */}
            {isCreditNoteMethod && (
              <FormField
                control={form.control}
                name="creditNoteId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Avoir à utiliser *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={!selectedParentId}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              !selectedParentId
                                ? 'Sélectionnez d\'abord une facture'
                                : 'Sélectionnez un avoir'
                            }
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {creditNotes?.map((creditNote: { id: string; creditNoteNumber: string; totalAmount: number; issueDate: Date }) => (
                          <SelectItem key={creditNote.id} value={creditNote.id}>
                            #{creditNote.creditNoteNumber} - Montant:{' '}
                            {Math.abs(creditNote.totalAmount).toLocaleString()} XPF
                          </SelectItem>
                        ))}
                        {creditNotes?.length === 0 && (
                          <div className="p-2 text-sm text-muted-foreground">
                            Aucun avoir disponible pour ce parent
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                    {!isCreditNoteAmountValid && selectedCreditNote && (
                      <p className="text-sm text-destructive">
                        Le montant ne peut pas dépasser le solde de l&apos;avoir (
                        {Math.abs(selectedCreditNote.totalAmount).toLocaleString()} XPF)
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Référence (sauf pour CREDIT_NOTE) */}
            {!isCreditNoteMethod && (
              <FormField
                control={form.control}
                name="reference"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Référence</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Numéro de chèque, référence virement, etc."
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Numéro de chèque, référence de virement, etc.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Informations complémentaires..."
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={createPayment.isPending}
              >
                Annuler
              </Button>
              <LoadingButton
                type="submit"
                loading={createPayment.isPending}
                disabled={
                  !isAmountValid ||
                  !isCreditNoteAmountValid ||
                  (isCreditNoteMethod && !selectedCreditNoteId)
                }
              >
                Enregistrer le paiement
              </LoadingButton>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
