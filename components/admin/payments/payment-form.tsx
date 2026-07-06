'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@/server/trpc/router';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { PaymentMethodSelect } from '@/components/shared/payment-method-select';
import { useDashboardBasePath } from '@/lib/hooks/use-dashboard-base-path';

const paymentFormSchema = z.object({
  invoiceId: z.string().uuid('Sélectionnez une facture'),
  amount: z.number().min(0.01, 'Montant minimum: 0.01'),
  paymentDate: z.string().min(1, 'Date de paiement requise'),
  paymentMethodId: z.string().uuid('Sélectionnez une méthode de paiement'),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

type PaymentFormValues = z.infer<typeof paymentFormSchema>;

type InvoiceListItem =
  inferRouterOutputs<AppRouter>['invoices']['list']['invoices'][number];

export function PaymentForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const basePath = useDashboardBasePath();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceListItem | null>(null);

  const invoiceIdParam = searchParams.get('invoiceId');

  // Récupérer les factures non payées
  const { data: invoicesData, isLoading: isLoadingInvoices } = trpc.invoices.list.useQuery({
    limit: 100,
    offset: 0,
    status: undefined, // Toutes les factures
  });

  const createPaymentMutation = trpc.payments.create.useMutation({
    onSuccess: () => {
      toast.success('Paiement enregistré avec succès');
      router.push(`${basePath}/payments`);
      router.refresh();
    },
    onError: (error) => {
      toast.error(error.message || 'Erreur lors de l\'enregistrement du paiement');
      setIsSubmitting(false);
    },
  });

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      invoiceId: invoiceIdParam || '',
      amount: 0,
      paymentDate: new Date().toISOString().split('T')[0],
      paymentMethodId: '',
      reference: '',
      notes: '',
    },
  });

  const watchInvoiceId = form.watch('invoiceId');

  useEffect(() => {
    if (watchInvoiceId && invoicesData) {
      const invoice = invoicesData.invoices.find((inv) => inv.id === watchInvoiceId);
      if (invoice) {
        setSelectedInvoice(invoice);
        // Pré-remplir le montant avec le reste à payer
        form.setValue('amount', invoice.remainingAmount);
      }
    }
  }, [watchInvoiceId, invoicesData, form]);

  const onSubmit = async (values: PaymentFormValues) => {
    setIsSubmitting(true);
    createPaymentMutation.mutate(values);
  };

  if (isLoadingInvoices) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Seules les factures émises ou en retard avec un reste à payer peuvent recevoir un paiement
  // (exclut DRAFT/devis, PAID, CANCELLED, CREDITED)
  const unpaidInvoices = invoicesData?.invoices.filter(
    (inv) =>
      (inv.status === 'SENT' || inv.status === 'OVERDUE') &&
      inv.remainingAmount > 0,
  ) || [];

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Informations du paiement */}
        <Card>
          <CardHeader>
            <CardTitle>Informations du paiement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Facture */}
            <FormField
              control={form.control}
              name="invoiceId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Facture</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionnez une facture" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {unpaidInvoices.map((invoice) => (
                        <SelectItem key={invoice.id} value={invoice.id}>
                          {invoice.invoiceNumber} - {invoice.parent.firstName} {invoice.parent.lastName}
                          (Reste: {invoice.remainingAmount.toLocaleString()} XPF)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Afficher les détails de la facture sélectionnée */}
            {selectedInvoice && (
              <div className="rounded-lg border p-4 bg-muted/50">
                <h4 className="font-semibold mb-2">Détails de la facture</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Total: </span>
                    <span className="font-medium">{selectedInvoice.totalAmount.toLocaleString()} XPF</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Payé: </span>
                    <span className="font-medium">{selectedInvoice.paidAmount.toLocaleString()} XPF</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Reste à payer: </span>
                    <span className="font-semibold text-primary">{selectedInvoice.remainingAmount.toLocaleString()} XPF</span>
                  </div>
                </div>
              </div>
            )}

            {/* Montant */}
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Montant (XPF)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      {...field}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                    />
                  </FormControl>
                  <FormDescription>
                    Montant du paiement (peut être partiel)
                  </FormDescription>
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
                  <FormLabel>Date de paiement</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Méthode de paiement */}
            <FormField
              control={form.control}
              name="paymentMethodId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Méthode de paiement</FormLabel>
                  <FormControl>
                    <PaymentMethodSelect
                      value={field.value}
                      onValueChange={field.onChange}
                      excludeCreditNote={true}
                      placeholder="Sélectionner une méthode de paiement"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Référence */}
            <FormField
              control={form.control}
              name="reference"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Référence (optionnel)</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Numéro de chèque, référence virement..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (optionnel)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Notes additionnelles..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={isSubmitting}
          >
            Annuler
          </Button>
          <Button type="submit" disabled={isSubmitting || !selectedInvoice}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enregistrer le paiement
          </Button>
        </div>
      </form>
    </Form>
  );
}
