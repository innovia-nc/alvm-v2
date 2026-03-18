'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { trpc } from '@/lib/trpc/client';
import { useServerPagination } from '@/hooks/use-server-pagination';
import { DataTableServer } from '@/components/ui/data-table-server';
import { adminCampColumns, type AdminCampType, AdminCampActions } from './columns';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

type ActionType = 'publish' | 'close';
type StatusFilter = 'ALL' | 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'CANCELLED';

const duplicateSchema = z.object({
  name: z.string().min(3, 'Nom requis (min 3 caractères)').max(200),
});

type DuplicateFormData = z.infer<typeof duplicateSchema>;

export function AdminCampsTableClient() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [actioningCamp, setActioningCamp] = useState<{
    camp: AdminCampType;
    action: ActionType;
  } | null>(null);
  const [duplicatingCamp, setDuplicatingCamp] = useState<AdminCampType | null>(
    null
  );

  // Hook de pagination server-side
  const pagination = useServerPagination({ defaultPageSize: 20 });

  // Query tRPC avec pagination, recherche et filtre statut
  const { data, isLoading } = trpc.camps.list.useQuery({
    limit: pagination.limit,
    offset: pagination.offset,
    search: searchTerm || undefined,
    ...(statusFilter !== 'ALL' && { status: statusFilter }),
  });

  const utils = trpc.useUtils();

  // Mutation de mise à jour (publish/close)
  const updateMutation = trpc.camps.update.useMutation({
    onSuccess: () => {
      const action = actioningCamp?.action;
      toast.success(
        action === 'publish' ? 'Camp publié avec succès' : 'Camp fermé avec succès'
      );
      setActioningCamp(null);
      utils.camps.list.invalidate();
      router.refresh();
    },
    onError: (err) => {
      toast.error(err.message || 'Impossible de mettre à jour le camp');
      setActioningCamp(null);
    },
  });

  // Mutation de duplication
  const duplicateMutation = trpc.camps.duplicate.useMutation({
    onSuccess: () => {
      toast.success('Camp dupliqué avec succès');
      setDuplicatingCamp(null);
      duplicateForm.reset();
      utils.camps.list.invalidate();
      router.refresh();
    },
    onError: (err) => {
      toast.error(err.message || 'Erreur lors de la duplication');
      setDuplicatingCamp(null);
    },
  });

  const duplicateForm = useForm<DuplicateFormData>({
    resolver: zodResolver(duplicateSchema),
    defaultValues: {
      name: '',
    },
  });

  const camps = data?.camps || [];

  async function handleAction() {
    if (!actioningCamp) return;
    try {
      await updateMutation.mutateAsync({
        id: actioningCamp.camp.id,
        status: actioningCamp.action === 'publish' ? 'PUBLISHED' : 'CLOSED',
      });
    } catch (err: any) {
      // Erreur déjà gérée par onError
    }
  }

  function handleDuplicate(values: DuplicateFormData) {
    if (!duplicatingCamp) return;
    duplicateMutation.mutate({
      id: duplicatingCamp.id,
      name: values.name,
    });
  }

  function openDuplicateDialog(camp: AdminCampType) {
    setDuplicatingCamp(camp);
    duplicateForm.reset({
      name: `${camp.name} (copie)`,
    });
  }

  const getActionTitle = () => {
    if (!actioningCamp) return '';
    return actioningCamp.action === 'publish' ? 'Publier le camp' : 'Fermer le camp';
  };

  const getActionDescription = () => {
    if (!actioningCamp) return '';
    const campName = actioningCamp.camp.name;
    return actioningCamp.action === 'publish'
      ? `Êtes-vous sûr de vouloir publier le camp "${campName}" ? Il sera visible par tous les parents.`
      : `Êtes-vous sûr de vouloir fermer le camp "${campName}" ? Aucune nouvelle inscription ne sera acceptée.`;
  };

  // Enrichir les colonnes avec les callbacks
  const columnsWithActions = adminCampColumns.map((col) => {
    if (col.id === 'actions') {
      return {
        ...col,
        cell: ({ row }: any) => (
          <AdminCampActions
            item={row.original}
            onPublish={(camp: AdminCampType) =>
              setActioningCamp({ camp, action: 'publish' })
            }
            onClose={(camp: AdminCampType) =>
              setActioningCamp({ camp, action: 'close' })
            }
            onDuplicate={openDuplicateDialog}
          />
        ),
      };
    }
    return col;
  });

  const isProcessing = updateMutation.isPending || duplicateMutation.isPending;
  const hasActiveFilters = statusFilter !== 'ALL';

  function resetFilters() {
    setStatusFilter('ALL');
  }

  return (
    <div className="space-y-4">
      {/* Filtres */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px]">
          <Label htmlFor="status-filter" className="mb-2 block">
            Filtrer par statut
          </Label>
          <Select
            value={statusFilter}
            onValueChange={(val) => {
              setStatusFilter(val as StatusFilter);
              pagination.resetToFirstPage();
            }}
          >
            <SelectTrigger id="status-filter">
              <SelectValue placeholder="Tous les statuts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tous les statuts</SelectItem>
              <SelectItem value="DRAFT">Brouillons</SelectItem>
              <SelectItem value="PUBLISHED">Publiés</SelectItem>
              <SelectItem value="CLOSED">Fermés</SelectItem>
              <SelectItem value="CANCELLED">Annulés</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {hasActiveFilters && (
          <div>
            <Button variant="outline" onClick={resetFilters} size="default">
              <X className="mr-2 h-4 w-4" />
              Réinitialiser
            </Button>
          </div>
        )}
      </div>

      {/* Table avec pagination */}
      <DataTableServer
        columns={columnsWithActions}
        data={camps}
        totalCount={data?.total || 0}
        isLoading={isLoading}
        pagination={pagination}
        searchKey="name"
        searchPlaceholder="Rechercher par nom ou lieu..."
        onSearchChange={setSearchTerm}
      />

      {/* Dialog de confirmation d'action (publish/close) */}
      <AlertDialog
        open={!!actioningCamp}
        onOpenChange={(open) => !open && setActioningCamp(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{getActionTitle()}</AlertDialogTitle>
            <AlertDialogDescription>
              {getActionDescription()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleAction} disabled={isProcessing}>
              {isProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de duplication */}
      <Dialog
        open={!!duplicatingCamp}
        onOpenChange={(open) => !open && setDuplicatingCamp(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dupliquer le camp</DialogTitle>
            <DialogDescription>
              Créez une copie de "{duplicatingCamp?.name}" avec les mêmes dates. Le
              nouveau camp sera créé en mode brouillon.
            </DialogDescription>
          </DialogHeader>

          <Form {...duplicateForm}>
            <form
              onSubmit={duplicateForm.handleSubmit(handleDuplicate)}
              className="space-y-4"
            >
              <FormField
                control={duplicateForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nom du nouveau camp *</FormLabel>
                    <FormControl>
                      <Input placeholder="Nom du camp dupliqué" {...field} />
                    </FormControl>
                    <FormDescription>
                      Toutes les autres informations seront copiées à l'identique
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDuplicatingCamp(null)}
                  disabled={duplicateMutation.isPending}
                >
                  Annuler
                </Button>
                <Button type="submit" disabled={duplicateMutation.isPending}>
                  {duplicateMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Dupliquer
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
