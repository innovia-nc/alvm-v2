'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { trpc } from '@/lib/trpc/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Plus, Trash2 } from 'lucide-react';

// ============================================================================
// SCHEMA
// ============================================================================

const creditNoteFormSchema = z.object({
  creditedInvoiceId: z.string().uuid('Veuillez sélectionner une facture').optional(),
  parentId: z.string().uuid('Veuillez sélectionner un parent'),
  refundMethod: z.enum(['IMMEDIATE_REFUND', 'FUTURE_CREDIT']),
  reason: z.string().min(10, 'Le motif doit contenir au moins 10 caractères'),
  lines: z
    .array(
      z.object({
        registrationId: z.string().uuid().nullable(),
        description: z.string().min(3, 'La description doit contenir au moins 3 caractères'),
        quantity: z.number().min(1, 'La quantité doit être au moins 1'),
        unitPrice: z.number().min(0, 'Le prix unitaire ne peut pas être négatif'),
      })
    )
    .min(1, 'Au moins une ligne est requise'),
});

type CreditNoteFormValues = z.infer<typeof creditNoteFormSchema>;

// ============================================================================
// COMPOSANT
// ============================================================================

interface CreditNoteFormProps {
  redirectPath?: string;
}

export function CreditNoteForm({ redirectPath = '/dashboard/admin/credit-notes' }: CreditNoteFormProps) {
  const router = useRouter();
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null);

  // Récupérer toutes les factures (pour le select)
  const { data: invoicesData, isLoading: loadingInvoices } = trpc.invoices.list.useQuery({
    limit: 500,
    offset: 0,
  });

  // Récupérer les détails de la facture sélectionnée
  const { data: invoiceDetails } = trpc.invoices.getById.useQuery(
    { id: selectedInvoice! },
    { enabled: !!selectedInvoice }
  );

  const form = useForm<CreditNoteFormValues>({
    resolver: zodResolver(creditNoteFormSchema),
    defaultValues: {
      creditedInvoiceId: undefined,
      parentId: '',
      refundMethod: 'IMMEDIATE_REFUND',
      reason: '',
      lines: [
        {
          registrationId: null,
          description: '',
          quantity: 1,
          unitPrice: 0,
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'lines',
  });

  const createMutation = trpc.creditNotes.create.useMutation({
    onSuccess: () => {
      toast.success('Avoir créé avec succès');
      router.push(redirectPath);
      router.refresh();
    },
    onError: (error) => {
      toast.error(error.message || 'Erreur lors de la création');
    },
  });

  const onSubmit = (data: CreditNoteFormValues) => {
    createMutation.mutate(data);
  };

  const handleInvoiceChange = (invoiceId: string) => {
    setSelectedInvoice(invoiceId);
    form.setValue('creditedInvoiceId', invoiceId);
  };

  const handleCopyFromInvoice = () => {
    if (!invoiceDetails?.lines || invoiceDetails.lines.length === 0) {
      toast.error('Cette facture n\'a pas de lignes');
      return;
    }

    // Remplacer toutes les lignes par celles de la facture
    form.setValue(
      'lines',
      invoiceDetails.lines.map((line) => ({
        registrationId: line.registrationId,
        description: line.description,
        quantity: line.quantity,
        unitPrice: parseFloat(line.unitPrice.toString()),
      }))
    );

    // Remplir automatiquement le parentId depuis la facture
    if (invoiceDetails.parentId) {
      form.setValue('parentId', invoiceDetails.parentId);
    }

    toast.success('Lignes copiées depuis la facture');
  };

  const totalAmount = form.watch('lines').reduce((sum, line) => {
    return sum + line.quantity * line.unitPrice;
  }, 0);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Sélection de la facture */}
        <Card>
          <CardHeader>
            <CardTitle>Facture Concernée</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="creditedInvoiceId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Facture *</FormLabel>
                  <Select
                    disabled={loadingInvoices}
                    onValueChange={handleInvoiceChange}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionnez une facture" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {invoicesData?.invoices.map((invoice) => (
                        <SelectItem key={invoice.id} value={invoice.id}>
                          {invoice.invoiceNumber} - {invoice.parent.firstName}{' '}
                          {invoice.parent.lastName} -{' '}
                          {parseFloat(invoice.totalAmount.toString()).toLocaleString('fr-FR')} XPF
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {selectedInvoice && invoiceDetails && (
              <div className="rounded-lg border p-4 bg-muted/50">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="font-medium">Numéro :</span>
                    <span>{invoiceDetails.invoiceNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Client :</span>
                    <span>
                      {invoiceDetails.parent.firstName} {invoiceDetails.parent.lastName}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Montant total :</span>
                    <span>
                      {parseFloat(invoiceDetails.totalAmount.toString()).toLocaleString('fr-FR')} XPF
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Statut :</span>
                    <span>{invoiceDetails.status}</span>
                  </div>
                </div>

                {invoiceDetails.lines && invoiceDetails.lines.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-4 w-full"
                    onClick={handleCopyFromInvoice}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Copier les lignes de la facture
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Motif */}
        <Card>
          <CardHeader>
            <CardTitle>Motif de l'Avoir</CardTitle>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Raison *</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Expliquez le motif de la création de cet avoir (annulation, remboursement, erreur, etc.)"
                      rows={4}
                    />
                  </FormControl>
                  <FormDescription>
                    Minimum 10 caractères. Cette information sera visible sur le PDF.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Lignes de l'avoir */}
        <Card>
          <CardHeader>
            <CardTitle>Lignes de l'Avoir</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {fields.map((field, index) => (
              <div key={field.id} className="rounded-lg border p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Ligne {index + 1}</h4>
                  {fields.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <FormField
                    control={form.control}
                    name={`lines.${index}.description`}
                    render={({ field }) => (
                      <FormItem className="md:col-span-3">
                        <FormLabel>Description *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Description de la ligne" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`lines.${index}.quantity`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Quantité *</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="1"
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={`lines.${index}.unitPrice`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Prix unitaire (XPF) *</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            {...field}
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex items-end">
                    <div className="text-sm">
                      <div className="text-muted-foreground">Total ligne</div>
                      <div className="font-medium">
                        {(
                          form.watch(`lines.${index}.quantity`) *
                          form.watch(`lines.${index}.unitPrice`)
                        ).toLocaleString('fr-FR')}{' '}
                        XPF
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() =>
                append({
                  registrationId: null,
                  description: '',
                  quantity: 1,
                  unitPrice: 0,
                })
              }
            >
              <Plus className="mr-2 h-4 w-4" />
              Ajouter une ligne
            </Button>

            {/* Total */}
            <div className="rounded-lg border p-4 bg-red-50 dark:bg-red-950/20">
              <div className="flex items-center justify-between text-lg font-semibold">
                <span>Montant total de l'avoir :</span>
                <span className="text-red-600">-{totalAmount.toLocaleString('fr-FR')} XPF</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(redirectPath)}
            disabled={createMutation.isPending}
          >
            Annuler
          </Button>
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Créer l'avoir
          </Button>
        </div>
      </form>
    </Form>
  );
}
