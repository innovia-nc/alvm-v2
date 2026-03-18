'use client';

/**
 * Camp Types Management Page
 *
 * Page de gestion des types de camps pour les directeurs.
 * CRUD complet : Create, Read, Update, Toggle Active, Delete
 */

import { useState } from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Tag } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { LoadingSpinner } from '@/components/shared/loading-spinner';
import { EmptyState } from '@/components/shared/empty-state';
import { DataTable } from '@/components/ui/data-table';
import { campTypesColumns } from '@/components/admin/camp-types/camp-types-table-columns';
import { CampTypeDialog } from '@/components/admin/camp-types/camp-type-dialog';

export default function CampTypesPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Fetch all camp types (active + inactive)
  const { data: campTypes, isLoading, error } = trpc.campTypes.listAll.useQuery();

  // Handlers
  const handleCreate = () => {
    setEditingId(null);
    setDialogOpen(true);
  };

  const handleEdit = (id: string) => {
    setEditingId(id);
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
  };

  // Find editing camp type
  const editingCampType = editingId
    ? campTypes?.find((ct) => ct.id === editingId)
    : undefined;

  // Statistics
  const stats = {
    total: campTypes?.length || 0,
    active: campTypes?.filter((ct) => ct.active).length || 0,
    inactive: campTypes?.filter((ct) => !ct.active).length || 0,
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Types de Camps"
        description="Gérez les catégories de camps disponibles"
        actions={
          <Button onClick={handleCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Nouveau type de camp
          </Button>
        }
      />

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Liste des Types de Camps</CardTitle>
          <CardDescription>
            {stats.total} type{stats.total > 1 ? 's' : ''} de camp au total
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-900">
                Erreur lors du chargement des types de camps : {error.message}
              </p>
            </div>
          )}

          {!isLoading && !error && (!campTypes || campTypes.length === 0) && (
            <EmptyState
              icon={Tag}
              title="Aucun type de camp"
              description="Commencez par créer votre premier type de camp."
              action={{
                label: 'Créer un type de camp',
                onClick: handleCreate,
              }}
            />
          )}

          {!isLoading && !error && campTypes && campTypes.length > 0 && (
            <DataTable
              columns={campTypesColumns(handleEdit)}
              data={campTypes}
              searchPlaceholder="Rechercher un type de camp..."
              searchKey="name"
            />
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <CampTypeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onClose={handleCloseDialog}
        mode={editingId ? 'edit' : 'create'}
        campType={editingCampType}
      />
    </div>
  );
}
