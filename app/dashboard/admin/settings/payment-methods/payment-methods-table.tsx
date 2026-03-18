'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { trpc } from '@/lib/trpc/client';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';

// ============================================================================
// TYPES & SCHEMAS
// ============================================================================

type PaymentMethod = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  accountingCode: string | null;
  active: boolean;
  displayOrder: number;
  isSystem: boolean;
};

const paymentMethodSchema = z.object({
  name: z.string().min(2, 'Nom requis (min 2 caractères)').max(100),
  description: z.string().optional(),
  accountingCode: z
    .string()
    .regex(/^\d{6,10}$/, 'Code comptable invalide (6-10 chiffres requis)')
    .optional()
    .or(z.literal('')),
});

type PaymentMethodFormData = z.infer<typeof paymentMethodSchema>;

// ============================================================================
// COMPOSANT
// ============================================================================

interface PaymentMethodsTableProps {
  initialMethods: PaymentMethod[];
}

export function PaymentMethodsTable({ initialMethods }: PaymentMethodsTableProps) {
  const router = useRouter();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingMethod, setEditingMethod] = useState<PaymentMethod | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createMutation = trpc.paymentMethods.create.useMutation();
  const updateMutation = trpc.paymentMethods.update.useMutation();
  const deleteMutation = trpc.paymentMethods.delete.useMutation();

  const form = useForm<PaymentMethodFormData>({
    resolver: zodResolver(paymentMethodSchema),
    defaultValues: {
      name: '',
      description: '',
    },
  });

  function openCreateDialog() {
    setEditingMethod(null);
    form.reset({
      name: '',
      description: '',
      accountingCode: '',
    });
    setIsDialogOpen(true);
  }

  function openEditDialog(method: PaymentMethod) {
    setEditingMethod(method);
    form.reset({
      name: method.name,
      description: method.description || '',
      accountingCode: method.accountingCode || '',
    });
    setIsDialogOpen(true);
  }

  async function onSubmit(values: PaymentMethodFormData) {
    try {
      setError(null);

      if (editingMethod) {
        // Update
        await updateMutation.mutateAsync({
          id: editingMethod.id,
          name: values.name,
          description: values.description || undefined,
          accountingCode: values.accountingCode || undefined,
        });
      } else {
        // Create
        await createMutation.mutateAsync({
          name: values.name,
          description: values.description,
          accountingCode: values.accountingCode,
        });
      }

      setIsDialogOpen(false);
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette méthode de paiement ?')) {
      return;
    }

    try {
      setError(null);
      await deleteMutation.mutateAsync({ id });
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Impossible de supprimer cette méthode de paiement');
    }
  }

  const isLoading = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  return (
    <>
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-end mb-4">
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Ajouter une méthode de paiement
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nom</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Code comptable</TableHead>
            <TableHead>Statut</TableHead>
            <TableHead className="w-[120px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {initialMethods.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                Aucune méthode de paiement configurée
              </TableCell>
            </TableRow>
          ) : (
            initialMethods.map((method) => (
              <TableRow key={method.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {method.name}
                    {method.isSystem && (
                      <Badge variant="outline" className="text-xs">
                        Système
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {method.description || '-'}
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {method.accountingCode || (
                    <span className="text-muted-foreground italic">Non défini</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={method.active ? 'default' : 'secondary'}>
                    {method.active ? 'Actif' : 'Inactif'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditDialog(method)}
                      disabled={isLoading}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(method.id)}
                      disabled={isLoading || method.isSystem}
                      title={method.isSystem ? 'Impossible de supprimer une méthode système' : undefined}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* Dialog Create/Edit */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingMethod ? 'Modifier la méthode de paiement' : 'Ajouter une méthode de paiement'}
            </DialogTitle>
            <DialogDescription>
              {editingMethod
                ? 'Modifiez les informations de la méthode de paiement'
                : 'Créez une nouvelle méthode de paiement acceptée'}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nom *</FormLabel>
                    <FormControl>
                      <Input placeholder="Espèces, Chèque, Virement..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (optionnel)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Description de la méthode de paiement..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="accountingCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Code comptable (optionnel)</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ex: 530000, 512000, 511200..."
                        maxLength={10}
                        {...field}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground mt-1">
                      Code PCG à 6-10 chiffres (ex: 530000 pour Caisse, 512000 pour Banque)
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                  disabled={isLoading}
                >
                  Annuler
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingMethod ? 'Modifier' : 'Créer'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
