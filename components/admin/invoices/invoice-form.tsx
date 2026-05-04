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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Loader2, Trash2, FileText, CheckSquare } from 'lucide-react';
import { toast } from 'sonner';
import { useDashboardBasePath } from '@/lib/hooks/use-dashboard-base-path';

const invoiceFormSchema = z.object({
  parentId: z.string().uuid('Sélectionnez un parent'),
  dueDate: z.string().min(1, 'Date d\'échéance requise'),
  lines: z
    .array(
      z.object({
        registrationId: z.string().uuid('Chaque ligne doit être liée à une inscription'),
        description: z.string().min(3, 'Description requise (min 3 caractères)'),
        quantity: z.number().min(1, 'Quantité minimum: 1'),
        unitPrice: z.number().min(0, 'Prix unitaire doit être positif'),
      })
    )
    .min(1, 'Au moins une ligne requise'),
});

type InvoiceFormValues = z.infer<typeof invoiceFormSchema>;

export function InvoiceForm() {
  const router = useRouter();
  const basePath = useDashboardBasePath();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedRegistrationIds, setSelectedRegistrationIds] = useState<string[]>([]);

  // Récupérer la liste des parents
  const { data: parentsData, isLoading: isLoadingParents } = trpc.parents.list.useQuery({
    limit: 100,
    offset: 0,
  });

  const createInvoiceMutation = trpc.invoices.create.useMutation({
    onSuccess: () => {
      toast.success('Facture créée avec succès');
      router.push(`${basePath}/invoices`);
      router.refresh();
    },
    onError: (error) => {
      toast.error(error.message || 'Erreur lors de la création de la facture');
      setIsSubmitting(false);
    },
  });

  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: {
      parentId: '',
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // +30 jours
      lines: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'lines',
  });

  // Watch parentId pour charger les inscriptions
  const watchParentId = form.watch('parentId');

  // Récupérer les inscriptions non payées pour le parent sélectionné
  const { data: unpaidRegistrations, isLoading: isLoadingRegistrations } =
    trpc.invoices.fetchUnpaidRegistrations.useQuery(
      { parentId: watchParentId },
      { enabled: !!watchParentId }
    );

  // Fonction pour ajouter les inscriptions sélectionnées aux lignes
  const addSelectedRegistrations = () => {
    if (!unpaidRegistrations) return;

    selectedRegistrationIds.forEach((regId) => {
      const reg = unpaidRegistrations.registrations.find((r) => r.id === regId);
      if (reg) {
        append({
          registrationId: reg.id,
          description: `Inscription ${reg.childFirstName} ${reg.childLastName} - ${reg.campName}`,
          quantity: 1,
          unitPrice: reg.totalAmount,
        });
      }
    });

    // Réinitialiser la sélection
    setSelectedRegistrationIds([]);

    toast.success(`${selectedRegistrationIds.length} inscription(s) ajoutée(s)`);
  };

  // Toggle sélection d'une inscription
  const toggleRegistrationSelection = (regId: string) => {
    setSelectedRegistrationIds((prev) =>
      prev.includes(regId)
        ? prev.filter((id) => id !== regId)
        : [...prev, regId]
    );
  };

  const onSubmit = async (values: InvoiceFormValues) => {
    setIsSubmitting(true);
    createInvoiceMutation.mutate(values);
  };

  // Calculer le total
  const watchLines = form.watch('lines');
  const totalAmount = watchLines.reduce(
    (sum, line) => sum + (line.quantity || 0) * (line.unitPrice || 0),
    0
  );

  if (isLoadingParents) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Informations générales */}
        <Card>
          <CardHeader>
            <CardTitle>Informations de la facture</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Parent */}
            <FormField
              control={form.control}
              name="parentId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Parent</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionnez un parent" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {parentsData?.parents.map((parent) => (
                        <SelectItem key={parent.id} value={parent.id}>
                          {parent.firstName} {parent.lastName} ({parent.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Date d'échéance */}
            <FormField
              control={form.control}
              name="dueDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date d'échéance</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormDescription>
                    Date limite de paiement de la facture
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Inscriptions non payées */}
        {watchParentId && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Inscriptions non payées</CardTitle>
                {selectedRegistrationIds.length > 0 && (
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={addSelectedRegistrations}
                  >
                    <CheckSquare className="mr-2 h-4 w-4" />
                    Ajouter {selectedRegistrationIds.length} inscription(s)
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingRegistrations ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : unpaidRegistrations?.registrations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="mx-auto h-12 w-12 mb-3 text-muted-foreground/50" />
                  <p>Aucune inscription non payée pour ce parent</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {unpaidRegistrations?.registrations.map((reg) => (
                    <div
                      key={reg.id}
                      className="flex items-center space-x-4 rounded-lg border p-4 hover:bg-muted/50 transition-colors"
                    >
                      <Checkbox
                        id={`reg-${reg.id}`}
                        checked={selectedRegistrationIds.includes(reg.id)}
                        onCheckedChange={() => toggleRegistrationSelection(reg.id)}
                      />
                      <label
                        htmlFor={`reg-${reg.id}`}
                        className="flex-1 cursor-pointer space-y-1"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {reg.childFirstName} {reg.childLastName}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {reg.campName}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Inscription du {new Date(reg.registrationDate).toLocaleDateString('fr-FR')}
                        </div>
                      </label>
                      <div className="text-right">
                        <div className="font-semibold">
                          {reg.totalAmount.toLocaleString('fr-FR')} XPF
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Lignes de facture */}
        <Card>
          <CardHeader>
            <CardTitle>Lignes de facturation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {fields.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="mx-auto h-12 w-12 mb-3 text-muted-foreground/50" />
                <p>Aucune inscription sélectionnée</p>
                <p className="text-sm mt-2">
                  Sélectionnez un parent puis ajoutez des inscriptions ci-dessus
                </p>
              </div>
            ) : (
              fields.map((field, index) => {
              const line = watchLines[index];

              return (
                <div key={field.id} className="flex items-center justify-between rounded-lg border p-4 bg-muted/30">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        <FileText className="mr-1 h-3 w-3" />
                        Inscription
                      </Badge>
                    </div>
                    <p className="font-medium">{line?.description}</p>
                    <p className="text-sm text-muted-foreground">
                      Quantité: {line?.quantity} × {line?.unitPrice.toLocaleString('fr-FR')} XPF
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Total</p>
                      <p className="text-lg font-semibold">
                        {((line?.quantity || 0) * (line?.unitPrice || 0)).toLocaleString('fr-FR')} XPF
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(index)}
                      title="Retirer cette inscription"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              );
            })
            )}

            {fields.length > 0 && (
              <div className="flex justify-end border-t pt-4">
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Total de la facture</p>
                  <p className="text-2xl font-bold">{totalAmount.toLocaleString()} XPF</p>
                </div>
              </div>
            )}
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
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Créer la facture
          </Button>
        </div>
      </form>
    </Form>
  );
}
