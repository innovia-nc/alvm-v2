'use client';

import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, User, Plus, Loader2 } from 'lucide-react';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { toast } from 'sonner';
import type { SelectedParent } from './selected-parents-list';

// ============================================================================
// TYPES
// ============================================================================

interface ParentSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (parent: SelectedParent) => void;
  excludedParentIds?: string[];
  maxParents?: number;
  currentParentsCount?: number;
}

const relationshipOptions = [
  { value: 'mother', label: 'Mère' },
  { value: 'father', label: 'Père' },
  { value: 'guardian', label: 'Tuteur' },
  { value: 'step_mother', label: 'Belle-mère' },
  { value: 'step_father', label: 'Beau-père' },
  { value: 'grandparent', label: 'Grand-parent' },
  { value: 'other', label: 'Autre' },
];

// ============================================================================
// COMPOSANT
// ============================================================================

export function ParentSearchDialog({
  open,
  onOpenChange,
  onSelect,
  excludedParentIds = [],
  maxParents = 3,
  currentParentsCount = 0,
}: ParentSearchDialogProps) {
  const [search, setSearch] = useState('');
  const [relationship, setRelationship] = useState<string>('guardian');
  const debouncedSearch = useDebounce(search, 300);

  // Query pour rechercher les parents
  const { data, isLoading, isError } = trpc.parents.list.useQuery(
    {
      search: debouncedSearch,
      limit: 20,
      offset: 0,
      sortBy: 'lastName',
      sortOrder: 'asc',
    },
    {
      enabled: open, // Ne lance la query que si le dialog est ouvert
    }
  );

  // Filtrer les parents déjà sélectionnés
  const availableParents = data?.parents.filter(
    (parent) => !excludedParentIds.includes(parent.userId)
  ) ?? [];

  const handleSelect = (parent: NonNullable<typeof data>['parents'][0]) => {
    // Vérifier qu'on ne dépasse pas la limite
    if (currentParentsCount >= maxParents) {
      toast.error(`Maximum ${maxParents} parents autorisés`);
      return;
    }

    // Créer l'objet SelectedParent
    const selectedParent: SelectedParent = {
      id: '', // Sera généré côté serveur lors de la création
      parentId: parent.userId,
      firstName: parent.firstName,
      lastName: parent.lastName,
      email: parent.email,
      phone: parent.phone,
      isPrimary: currentParentsCount === 0, // Premier parent = principal
      relationship: relationship as SelectedParent['relationship'],
    };

    onSelect(selectedParent);
    onOpenChange(false);

    // Réinitialiser
    setSearch('');
    setRelationship('guardian');
  };

  // Réinitialiser la recherche quand le dialog se ferme
  useEffect(() => {
    if (!open) {
      setSearch('');
      setRelationship('guardian');
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Rechercher un parent</DialogTitle>
          <DialogDescription>
            Recherchez et sélectionnez un parent à associer à cet enfant
            {maxParents - currentParentsCount > 0 && (
              <span className="text-primary font-medium">
                {' '}({maxParents - currentParentsCount} place{maxParents - currentParentsCount > 1 ? 's' : ''} restante{maxParents - currentParentsCount > 1 ? 's' : ''})
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-auto">
          {/* Barre de recherche */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Rechercher par nom, email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={relationship} onValueChange={setRelationship}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Relation" />
              </SelectTrigger>
              <SelectContent>
                {relationshipOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Résultats de recherche */}
          <div className="space-y-2">
            {isLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}

            {isError && (
              <Card className="border-destructive">
                <CardContent className="py-6 text-center text-sm text-destructive">
                  Erreur lors de la recherche des parents
                </CardContent>
              </Card>
            )}

            {!isLoading && !isError && availableParents.length === 0 && (
              <Card className="border-dashed">
                <CardContent className="py-8 text-center">
                  <User className="mx-auto h-12 w-12 text-muted-foreground opacity-50 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    {search ? 'Aucun parent trouvé pour cette recherche' : 'Recherchez un parent par nom ou email'}
                  </p>
                </CardContent>
              </Card>
            )}

            {!isLoading && !isError && availableParents.length > 0 && (
              <>
                <div className="text-sm text-muted-foreground mb-2">
                  {availableParents.length} parent{availableParents.length > 1 ? 's' : ''} trouvé{availableParents.length > 1 ? 's' : ''}
                </div>
                {availableParents.map((parent) => (
                  <Card key={parent.userId} className="hover:border-primary transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        {/* Informations parent */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <span className="font-medium truncate">
                              {parent.firstName} {parent.lastName}
                            </span>
                          </div>

                          <div className="space-y-0.5 text-sm text-muted-foreground">
                            <div className="truncate">{parent.email}</div>
                            <div className="truncate">{parent.phone}</div>
                            {parent.childrenCount !== undefined && parent.childrenCount > 0 && (
                              <div className="flex gap-1 mt-1">
                                <Badge variant="secondary" className="text-xs">
                                  {parent.childrenCount} enfant{parent.childrenCount > 1 ? 's' : ''}
                                </Badge>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Bouton d'ajout */}
                        <Button
                          size="sm"
                          onClick={() => handleSelect(parent)}
                          className="gap-1 flex-shrink-0"
                        >
                          <Plus className="h-4 w-4" />
                          Ajouter
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
