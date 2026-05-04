'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import { useDashboardBasePath } from '@/lib/hooks/use-dashboard-base-path';

const refundFormSchema = z.object({
  paymentId: z.string().uuid('Sélectionnez un paiement'),
  amount: z.number().min(0.01, 'Montant minimum: 0.01'),
  refundDate: z.string().min(1, 'Date de remboursement requise'),
  refundMethod: z.enum(['IMMEDIATE_REFUND', 'FUTURE_CREDIT']),
  reason: z.string().min(3, 'Raison requise (min 3 caractères)'),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

type RefundFormValues = z.infer<typeof refundFormSchema>;

export function RefundForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const basePath = useDashboardBasePath();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<any>(null);

  const paymentIdParam = searchParams.get('paymentId');

  // Récupérer les paiements (on peut rembourser n'importe quel paiement)
  const { data: paymentsData, isLoading: isLoadingPayments } = trpc.payments.list.useQuery({
    limit: 100,
    offset: 0,
  });

  const createRefundMutation = trpc.refunds.create.useMutation({
    onSuccess: () => {
      toast.success('Remboursement enregistré avec succès');
      router.push(`${basePath}/refunds`);
      router.refresh();
    },
    onError: (error) => {
      toast.error(error.message || 'Erreur lors de l\'enregistrement du remboursement');
      setIsSubmitting(false);
    },
  });

  const form = useForm<RefundFormValues>({
    resolver: zodResolver(refundFormSchema),
    defaultValues: {
      paymentId: paymentIdParam || '',
      amount: 0,
      refundDate: new Date().toISOString().split('T')[0],
      refundMethod: 'IMMEDIATE_REFUND',
      reason: '',
      reference: '',
      notes: '',
    },
  });

  const watchPaymentId = form.watch('paymentId');

  useEffect(() => {
    if (watchPaymentId && paymentsData) {
      const payment = paymentsData.payments.find((p) => p.id === watchPaymentId);
      if (payment) {
        setSelectedPayment(payment);
        // Pré-remplir le montant avec le montant du paiement
        form.setValue('amount', payment.amount);
      }
    }
  }, [watchPaymentId, paymentsData, form]);

  const onSubmit = async (values: RefundFormValues) => {
    setIsSubmitting(true);
    createRefundMutation.mutate(values);
  };

  if (isLoadingPayments) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Informations du remboursement */}
        <Card>
          <CardHeader>
            <CardTitle>Informations du remboursement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Paiement */}
            <FormField
              control={form.control}
              name="paymentId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Paiement à rembourser</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionnez un paiement" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {paymentsData?.payments.map((payment) => (
                        <SelectItem key={payment.id} value={payment.id}>
                          {payment.invoice.invoiceNumber} - {payment.invoice.parent.firstName}{' '}
                          {payment.invoice.parent.lastName} ({payment.amount.toLocaleString()} XPF -{' '}
                          {new Date(payment.paymentDate).toLocaleDateString('fr-FR')})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Afficher les détails du paiement sélectionné */}
            {selectedPayment && (
              <div className="rounded-lg border p-4 bg-muted/50">
                <h4 className="font-semibold mb-2">Détails du paiement</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Facture: </span>
                    <span className="font-medium">{selectedPayment.invoice.invoiceNumber}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Montant payé: </span>
                    <span className="font-medium">{selectedPayment.amount.toLocaleString()} XPF</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Date de paiement: </span>
                    <span className="font-medium">
                      {new Date(selectedPayment.paymentDate).toLocaleDateString('fr-FR')}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Méthode: </span>
                    <span className="font-medium">{selectedPayment.paymentMethod}</span>
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
                  <FormLabel>Montant du remboursement (XPF)</FormLabel>
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
                    Montant à rembourser (peut être partiel ou total)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Date de remboursement */}
            <FormField
              control={form.control}
              name="refundDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date de remboursement</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Méthode de remboursement */}
            <FormField
              control={form.control}
              name="refundMethod"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Méthode de remboursement</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="IMMEDIATE_REFUND">Remboursement immediat</SelectItem>
                      <SelectItem value="FUTURE_CREDIT">Avoir / Credit futur</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Raison */}
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Raison du remboursement</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Ex: Annulation d'inscription, erreur de paiement..."
                      {...field}
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
          <Button type="submit" disabled={isSubmitting || !selectedPayment}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enregistrer le remboursement
          </Button>
        </div>
      </form>
    </Form>
  );
}
