'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Trash2, Plus, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { useDashboardBasePath } from '@/lib/hooks/use-dashboard-base-path';

const invoiceEditSchema = z.object({
  lines: z
    .array(
      z.object({
        registrationId: z.string().uuid().nullable(),
        description: z.string().min(3, 'Description requise (min 3 caractères)'),
        quantity: z.number().int().min(1, 'Quantité minimum: 1'),
        unitPrice: z.number().min(0, 'Prix unitaire doit être positif'),
      }),
    )
    .min(1, 'Au moins une ligne requise'),
});

type InvoiceEditValues = z.infer<typeof invoiceEditSchema>;

type InvoiceForEdit = {
  id: string;
  invoiceNumber: string;
  status: string;
  dueDate: Date;
  taxRate?: number;
  parent: { firstName: string; lastName: string; email: string };
  lines: Array<{
    id: string;
    registrationId: string | null;
    description: string;
    quantity: number;
    unitPrice: number;
  }>;
};

export function InvoiceEditForm({
  invoice,
  version,
}: {
  invoice: InvoiceForEdit;
  version: number;
}) {
  const router = useRouter();
  const basePath = useDashboardBasePath();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const utils = trpc.useUtils();

  const updateInvoiceMutation = trpc.invoices.update.useMutation({
    onSuccess: () => {
      toast.success('Facture mise à jour avec succès');
      utils.invoices.getById.invalidate({ id: invoice.id });
      router.push(`${basePath}/invoices/${invoice.id}`);
      router.refresh();
    },
    onError: (error) => {
      toast.error(error.message || 'Erreur lors de la mise à jour de la facture');
      setIsSubmitting(false);
    },
  });

  const form = useForm<InvoiceEditValues>({
    resolver: zodResolver(invoiceEditSchema),
    defaultValues: {
      lines: invoice.lines.map((l) => ({
        registrationId: l.registrationId,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
      })),
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'lines',
  });

  const onSubmit = (values: InvoiceEditValues) => {
    setIsSubmitting(true);
    updateInvoiceMutation.mutate({
      id: invoice.id,
      version,
      lines: values.lines,
    });
  };

  const watchLines = form.watch('lines');
  const taxRate = invoice.taxRate ?? 0;
  const subtotalHt = watchLines.reduce(
    (sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0),
    0,
  );
  const taxAmount = subtotalHt * taxRate;
  const totalTtc = subtotalHt + taxAmount;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Infos en lecture seule */}
        <Card>
          <CardHeader>
            <CardTitle>Informations de la facture</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-6 text-sm">
            <div>
              <p className="text-muted-foreground">Numéro</p>
              <p className="font-medium">{invoice.invoiceNumber}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Parent</p>
              <p className="font-medium">
                {invoice.parent.firstName} {invoice.parent.lastName}
              </p>
              <p className="text-xs text-muted-foreground">{invoice.parent.email}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Date d'échéance</p>
              <p className="font-medium">
                {new Date(invoice.dueDate).toLocaleDateString('fr-FR')}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Statut</p>
              <Badge variant="secondary">
                <FileText className="mr-1 h-3 w-3" />
                Brouillon
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Lignes éditables */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Lignes de facturation</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
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
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {fields.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="mx-auto h-12 w-12 mb-3 text-muted-foreground/50" />
                <p>Aucune ligne — ajoutez-en au moins une</p>
              </div>
            ) : (
              fields.map((field, index) => {
                const line = watchLines[index];
                const lineTotal =
                  (Number(line?.quantity) || 0) * (Number(line?.unitPrice) || 0);
                const isRegLine = !!line?.registrationId;

                return (
                  <div
                    key={field.id}
                    className="rounded-lg border p-4 bg-muted/30 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      {isRegLine && (
                        <Badge variant="secondary" className="text-xs">
                          <FileText className="mr-1 h-3 w-3" />
                          Inscription
                        </Badge>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(index)}
                        className="ml-auto"
                        title="Supprimer cette ligne"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>

                    <FormField
                      control={form.control}
                      name={`lines.${index}.description`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-3 gap-3">
                      <FormField
                        control={form.control}
                        name={`lines.${index}.quantity`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Quantité</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min={1}
                                step={1}
                                {...field}
                                onChange={(e) => field.onChange(e.target.valueAsNumber)}
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
                            <FormLabel>Prix unitaire (XPF)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min={0}
                                step={1}
                                {...field}
                                onChange={(e) => field.onChange(e.target.valueAsNumber)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="flex flex-col">
                        <span className="text-sm font-medium mb-2">Total ligne</span>
                        <span className="rounded-md border border-input bg-background px-3 py-2 text-sm font-semibold tabular-nums">
                          {lineTotal.toLocaleString('fr-FR')} XPF
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {fields.length > 0 && (
              <div className="border-t pt-4 space-y-1 text-right">
                <p className="text-sm">
                  <span className="text-muted-foreground">Sous-total HT : </span>
                  <span className="font-semibold tabular-nums">
                    {subtotalHt.toLocaleString('fr-FR')} XPF
                  </span>
                </p>
                <p className="text-sm">
                  <span className="text-muted-foreground">
                    TGC ({(taxRate * 100).toLocaleString('fr-FR')}%) :{' '}
                  </span>
                  <span className="font-semibold tabular-nums">
                    {taxAmount.toLocaleString('fr-FR')} XPF
                  </span>
                </p>
                <p>
                  <span className="text-muted-foreground">Total TTC : </span>
                  <span className="text-2xl font-bold tabular-nums">
                    {totalTtc.toLocaleString('fr-FR')} XPF
                  </span>
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`${basePath}/invoices/${invoice.id}`)}
            disabled={isSubmitting}
          >
            Annuler
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enregistrer les modifications
          </Button>
        </div>
      </form>
    </Form>
  );
}
