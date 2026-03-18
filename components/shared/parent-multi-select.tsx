'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { SelectedParentsList, type SelectedParent } from './selected-parents-list';
import { ParentSearchDialog } from './parent-search-dialog';
import { toast } from 'sonner';

// ============================================================================
// TYPES
// ============================================================================

interface ParentMultiSelectProps {
  value: SelectedParent[];
  onChange: (parents: SelectedParent[]) => void;
  maxParents?: number;
  disabled?: boolean;
  error?: string;
}

// ============================================================================
// COMPOSANT PRINCIPAL
// ============================================================================

export function ParentMultiSelect({
  value,
  onChange,
  maxParents = 3,
  disabled = false,
  error,
}: ParentMultiSelectProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  // Handler pour ajouter un parent
  const handleAddParent = (parent: SelectedParent) => {
    // Vérifier qu'on ne dépasse pas la limite
    if (value.length >= maxParents) {
      toast.error(`Maximum ${maxParents} parents autorisés`);
      return;
    }

    // Vérifier que ce parent n'est pas déjà sélectionné
    if (value.some((p) => p.parentId === parent.parentId)) {
      toast.error('Ce parent est déjà sélectionné');
      return;
    }

    // Si c'est le premier parent, le marquer comme principal
    const updatedParent = {
      ...parent,
      isPrimary: value.length === 0,
    };

    onChange([...value, updatedParent]);
    toast.success('Parent ajouté avec succès');
  };

  // Handler pour définir un parent comme principal
  const handleSetPrimary = (parentId: string) => {
    const updatedParents = value.map((parent) => ({
      ...parent,
      isPrimary: parent.parentId === parentId,
    }));

    onChange(updatedParents);
    toast.success('Parent principal mis à jour');
  };

  // Handler pour retirer un parent
  const handleRemove = (parentId: string) => {
    // Vérifier qu'il restera au moins 1 parent
    if (value.length <= 1) {
      toast.error('Au moins un parent est requis');
      return;
    }

    const parentToRemove = value.find((p) => p.parentId === parentId);
    const updatedParents = value.filter((p) => p.parentId !== parentId);

    // Si on retire le parent principal, promouvoir le premier restant
    if (parentToRemove?.isPrimary && updatedParents.length > 0 && updatedParents[0]) {
      updatedParents[0].isPrimary = true;
    }

    onChange(updatedParents);
    toast.success('Parent retiré avec succès');
  };

  // IDs des parents déjà sélectionnés (pour filtrage)
  const selectedParentIds = value.map((p) => p.parentId);

  return (
    <div className="space-y-4">
      {/* Liste des parents sélectionnés */}
      <SelectedParentsList
        parents={value}
        onSetPrimary={handleSetPrimary}
        onRemove={handleRemove}
        maxParents={maxParents}
        disabled={disabled}
        showActions={!disabled}
      />

      {/* Bouton d'ajout */}
      {value.length < maxParents && !disabled && (
        <Button
          type="button"
          variant="outline"
          onClick={() => setDialogOpen(true)}
          className="w-full gap-2"
        >
          <Plus className="h-4 w-4" />
          Ajouter un parent ({maxParents - value.length} place{maxParents - value.length > 1 ? 's' : ''} restante{maxParents - value.length > 1 ? 's' : ''})
        </Button>
      )}

      {/* Message d'erreur */}
      {error && (
        <p className="text-sm font-medium text-destructive">{error}</p>
      )}

      {/* Dialog de recherche */}
      <ParentSearchDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSelect={handleAddParent}
        excludedParentIds={selectedParentIds}
        maxParents={maxParents}
        currentParentsCount={value.length}
      />
    </div>
  );
}
