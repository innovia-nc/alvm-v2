'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ParentSearchDialog } from '@/components/shared/parent-search-dialog';
import type { SelectedParent } from '@/components/shared/selected-parents-list';
import { Star, User, Mail, Phone, Plus, Trash2, AlertCircle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
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

// ============================================================================
// TYPES
// ============================================================================

interface ManageParentsProps {
  childId: string;
  initialParents: Array<{
    id: string;
    parentId: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    isPrimary: boolean;
    relationship: 'mother' | 'father' | 'guardian' | 'step_mother' | 'step_father' | 'grandparent' | 'other' | null;
  }>;
}

// ============================================================================
// LABELS DE RELATION
// ============================================================================

const relationshipLabels: Record<string, string> = {
  mother: 'Mère',
  father: 'Père',
  guardian: 'Tuteur',
  step_mother: 'Belle-mère',
  step_father: 'Beau-père',
  grandparent: 'Grand-parent',
  other: 'Autre',
};

// ============================================================================
// COMPOSANT PRINCIPAL
// ============================================================================

export function ManageParents({ childId, initialParents }: ManageParentsProps) {
  const router = useRouter();
  const utils = trpc.useUtils();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [parentToRemove, setParentToRemove] = useState<string | null>(null);

  // Query pour récupérer les parents actuels
  const { data: parentsData, isLoading } = trpc.children.getParents.useQuery(
    { childId },
    {
      initialData: initialParents,
      refetchOnMount: true,
    }
  );

  const parents = parentsData || [];

  // Mutation pour ajouter un parent
  const addParentMutation = trpc.children.addParent.useMutation({
    onSuccess: () => {
      toast.success('Parent ajouté avec succès');
      utils.children.getParents.invalidate({ childId });
      utils.children.getById.invalidate({ id: childId });
      router.refresh();
    },
    onError: (error) => {
      toast.error('Erreur lors de l\'ajout du parent', {
        description: error.message,
      });
    },
  });

  // Mutation pour retirer un parent
  const removeParentMutation = trpc.children.removeParent.useMutation({
    onSuccess: () => {
      toast.success('Parent retiré avec succès');
      utils.children.getParents.invalidate({ childId });
      utils.children.getById.invalidate({ id: childId });
      router.refresh();
    },
    onError: (error) => {
      toast.error('Erreur lors du retrait du parent', {
        description: error.message,
      });
    },
  });

  // Mutation pour définir le parent principal
  const setPrimaryMutation = trpc.children.setPrimaryParent.useMutation({
    onSuccess: () => {
      toast.success('Parent principal mis à jour');
      utils.children.getParents.invalidate({ childId });
      utils.children.getById.invalidate({ id: childId });
      router.refresh();
    },
    onError: (error) => {
      toast.error('Erreur lors de la mise à jour du parent principal', {
        description: error.message,
      });
    },
  });

  // Handler pour ajouter un parent
  const handleAddParent = (parent: SelectedParent) => {
    addParentMutation.mutate({
      childId,
      parentId: parent.parentId,
      isPrimary: parents.length === 0, // Premier parent = principal
      relationship: parent.relationship || undefined,
    });
  };

  // Handler pour définir comme principal
  const handleSetPrimary = (parentId: string) => {
    setPrimaryMutation.mutate({
      childId,
      parentId,
    });
  };

  // Handler pour confirmer le retrait
  const confirmRemove = () => {
    if (!parentToRemove) return;

    removeParentMutation.mutate({
      childId,
      parentId: parentToRemove,
    });

    setRemoveDialogOpen(false);
    setParentToRemove(null);
  };

  // Handler pour initier le retrait
  const initiateRemove = (parentId: string) => {
    setParentToRemove(parentId);
    setRemoveDialogOpen(true);
  };

  // IDs des parents déjà sélectionnés
  const selectedParentIds = parents.map((p) => p.parentId);

  // Tri : parent principal en premier
  const sortedParents = [...parents].sort((a, b) => {
    if (a.isPrimary && !b.isPrimary) return -1;
    if (!a.isPrimary && b.isPrimary) return 1;
    return 0;
  });

  const isPending =
    addParentMutation.isPending ||
    removeParentMutation.isPending ||
    setPrimaryMutation.isPending ||
    isLoading;

  return (
    <div className="space-y-6">
      {/* Informations */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Vous pouvez associer de 1 à 3 parents maximum à cet enfant.
          Le parent principal sera utilisé par défaut pour la facturation et la communication.
        </AlertDescription>
      </Alert>

      {/* Liste des parents actuels */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Parents associés ({parents.length}/3)</CardTitle>
              <CardDescription>
                Gérez les parents de cet enfant
              </CardDescription>
            </div>
            {parents.length < 3 && (
              <Button
                onClick={() => setDialogOpen(true)}
                disabled={isPending}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Ajouter un parent
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {parents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed rounded-lg">
              <User className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
              <p className="text-sm text-muted-foreground">
                Aucun parent associé. Ajoutez au moins un parent pour continuer.
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {sortedParents.map((parent) => (
                <div
                  key={parent.parentId}
                  className={`rounded-lg border p-4 transition-colors ${
                    parent.isPrimary ? 'border-primary bg-primary/5' : ''
                  }`}
                >
                  {/* Header avec nom et badges */}
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <User className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      <span className="font-medium truncate">
                        {parent.firstName} {parent.lastName}
                      </span>
                    </div>

                    <div className="flex gap-2 flex-shrink-0">
                      {parent.isPrimary && (
                        <Badge variant="default" className="gap-1">
                          <Star className="h-3 w-3 fill-current" />
                          Principal
                        </Badge>
                      )}
                      {parent.relationship && (
                        <Badge variant="outline" className="text-xs">
                          {relationshipLabels[parent.relationship] || parent.relationship}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Coordonnées */}
                  <div className="space-y-2 text-sm mb-4">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate">{parent.email}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate">{parent.phone}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-3 border-t">
                    {!parent.isPrimary && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSetPrimary(parent.parentId)}
                        disabled={isPending}
                        className="gap-2"
                      >
                        <CheckCircle className="h-4 w-4" />
                        Définir comme principal
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => initiateRemove(parent.parentId)}
                      disabled={isPending || parents.length === 1}
                      className="gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      Retirer
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Informations complémentaires */}
          {parents.length > 1 && (
            <p className="text-xs text-muted-foreground mt-4 p-3 bg-muted rounded-md">
              \ℹ\️ Cet enfant a {parents.length} parents associés.
              {sortedParents[0]?.isPrimary && (
                <> {sortedParents[0].firstName} {sortedParents[0].lastName} est le parent principal et sera utilisé par défaut pour la facturation et la communication.</>
              )}
            </p>
          )}

          {parents.length === 1 && (
            <p className="text-xs text-muted-foreground mt-4 p-3 bg-muted rounded-md">
              \⚠\️ Cet enfant doit avoir au moins 1 parent. Vous ne pouvez pas retirer le dernier parent.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Dialog de recherche de parent */}
      <ParentSearchDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSelect={handleAddParent}
        excludedParentIds={selectedParentIds}
        maxParents={3}
        currentParentsCount={parents.length}
      />

      {/* Dialog de confirmation de retrait */}
      <AlertDialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer ce parent ?</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir retirer ce parent de cet enfant ?
              Cette action ne supprimera pas le compte parent, mais seulement l'association avec cet enfant.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setParentToRemove(null)}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRemove}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Confirmer le retrait
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
