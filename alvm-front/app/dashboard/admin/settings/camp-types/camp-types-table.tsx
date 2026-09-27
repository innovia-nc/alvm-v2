'use client';

import { PageHeader } from '@/components/shared/page-header';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { trpc } from '@/lib/trpc/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

// ============================================================================
// TYPES & SCHEMAS
// ============================================================================

type CampType = {
  id: string;
  name: string;
  description: string | null;
  accountingCode: string | null;
  active: boolean;
};

const campTypeSchema = z.object({
  name: z.string().min(2, 'Nom requis (min 2 caractères)').max(100),
  description: z.string().optional(),
  accountingCode: z
    .string()
    .regex(/^\d{6}$/, 'Code comptable invalide (6 chiffres)')
    .optional()
    .or(z.literal('')),
});

type CampTypeFormData = z.infer<typeof campTypeSchema>;

// ============================================================================
// COMPOSANT
// ============================================================================

interface CampTypesTableProps {
  initialCampTypes: CampType[];
}

export function CampTypesTable({ initialCampTypes }: CampTypesTableProps) {
  const router = useRouter();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<CampType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CampType | null>(null);

  const createMutation = trpc.campTypes.create.useMutation();
  const updateMutation = trpc.campTypes.update.useMutation();
  const deleteMutation = trpc.campTypes.delete.useMutation();

  const form = useForm<CampTypeFormData>({
    resolver: zodResolver(campTypeSchema),
    defaultValues: {
      name: '',
      description: '',
      accountingCode: '',
    },
  });

  function openCreateDialog() {
    setError(null);
    setEditingType(null);
    form.reset({
      name: '',
      description: '',
      accountingCode: '',
    });
    setIsDialogOpen(true);
  }

  function openEditDialog(type: CampType) {
    setError(null);
    setEditingType(type);
    form.reset({
      name: type.name,
      description: type.description || '',
      accountingCode: type.accountingCode || '',
    });
    setIsDialogOpen(true);
  }

  async function onSubmit(values: CampTypeFormData) {
    try {
      setError(null);

      if (editingType) {
        // Update
        await updateMutation.mutateAsync({
          id: editingType.id,
          name: values.name,
          description: values.description || undefined,
          accountingCode: values.accountingCode || undefined,
        });
      } else {
        // Create
        await createMutation.mutateAsync({
          name: values.name,
          description: values.description,
          accountingCode: values.accountingCode || undefined,
        });
      }

      setIsDialogOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Une erreur est survenue');
    }
  }

  async function handleDelete(id: string) {
    try {
      setError(null);
      await deleteMutation.mutateAsync({ id });
      setDeleteTarget(null);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'Impossible de supprimer ce type de camp',
      );
    }
  }

  const isLoading =
    createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  return (
    <div className="space-y-6">
      {error && !isDialogOpen && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <PageHeader
        title="Types d’ACM"
        description="Gérez les types d’accueil proposés aux familles."
        actions={
          <Button onClick={openCreateDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Ajouter un type de camp
          </Button>
        }
      />

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Code Comptable</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {initialCampTypes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Aucun type de camp configuré
                </TableCell>
              </TableRow>
            ) : (
              initialCampTypes.map((type) => (
                <TableRow key={type.id}>
                  <TableCell className="font-medium">{type.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {type.description || '-'}
                  </TableCell>
                  <TableCell>{type.accountingCode || '-'}</TableCell>
                  <TableCell>
                    <Badge variant={type.active ? 'default' : 'secondary'}>
                      {type.active ? 'Actif' : 'Inactif'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(type)}
                        disabled={isLoading}
                        aria-label="Modifier"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setError(null);
                          setDeleteTarget(type);
                        }}
                        disabled={isLoading}
                        aria-label="Supprimer"
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
      </div>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce type d’ACM ?</AlertDialogTitle>
            <AlertDialogDescription>
              Confirmez la suppression de « {deleteTarget?.name} ».
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                if (deleteTarget) void handleDelete(deleteTarget.id);
              }}
            >
              {deleteMutation.isPending ? 'Suppression…' : 'Supprimer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog Create/Edit */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingType ? 'Modifier le type de camp' : 'Ajouter un type de camp'}
            </DialogTitle>
            <DialogDescription>
              {editingType
                ? 'Modifiez les informations du type de camp'
                : 'Créez un nouveau type de camp pour les inscriptions'}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nom *</FormLabel>
                    <FormControl>
                      <Input placeholder="Multi-activités" {...field} />
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
                      <Textarea placeholder="Description du type de camp..." {...field} />
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
                    <FormLabel>Code comptable FEC (optionnel)</FormLabel>
                    <FormControl>
                      <Input placeholder="707000" maxLength={6} {...field} />
                    </FormControl>
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
                  {editingType ? 'Modifier' : 'Créer'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
