'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Star, Trash2, User } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

export interface SelectedParent {
  id: string;
  parentId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  isPrimary: boolean;
  relationship?: 'mother' | 'father' | 'guardian' | 'step_mother' | 'step_father' | 'grandparent' | 'other' | null;
}

interface SelectedParentsListProps {
  parents: SelectedParent[];
  onSetPrimary?: (parentId: string) => void;
  onRemove?: (parentId: string) => void;
  maxParents?: number;
  disabled?: boolean;
  showActions?: boolean;
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
// COMPOSANT
// ============================================================================

export function SelectedParentsList({
  parents,
  onSetPrimary,
  onRemove,
  maxParents = 3,
  disabled = false,
  showActions = true,
}: SelectedParentsListProps) {
  if (parents.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center text-muted-foreground">
            <User className="mx-auto h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">Aucun parent sélectionné</p>
            <p className="text-xs mt-1">
              Minimum 1 parent requis, maximum {maxParents}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Tri : parent principal en premier
  const sortedParents = [...parents].sort((a, b) => {
    if (a.isPrimary && !b.isPrimary) return -1;
    if (!a.isPrimary && b.isPrimary) return 1;
    return 0;
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {parents.length} parent{parents.length > 1 ? 's' : ''} sélectionné{parents.length > 1 ? 's' : ''}
        </span>
        {parents.length < maxParents && (
          <span className="text-xs">
            {maxParents - parents.length} place{maxParents - parents.length > 1 ? 's' : ''} restante{maxParents - parents.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div className="grid gap-2">
        {sortedParents.map((parent) => (
          <Card
            key={parent.parentId}
            className={cn(
              'transition-all',
              parent.isPrimary && 'border-primary bg-primary/5'
            )}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                {/* Informations parent */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <span className="font-medium truncate">
                      {parent.firstName} {parent.lastName}
                    </span>
                    {parent.isPrimary && (
                      <Badge variant="default" className="gap-1">
                        <Star className="h-3 w-3 fill-current" />
                        Principal
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-0.5 text-sm text-muted-foreground">
                    <div className="truncate">{parent.email}</div>
                    <div className="truncate">{parent.phone}</div>
                    {parent.relationship && (
                      <div>
                        <Badge variant="outline" className="text-xs">
                          {relationshipLabels[parent.relationship] || parent.relationship}
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                {showActions && !disabled && (
                  <div className="flex flex-col gap-1">
                    {!parent.isPrimary && onSetPrimary && parents.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onSetPrimary(parent.parentId)}
                        className="h-8 gap-1"
                        title="Définir comme parent principal"
                      >
                        <Star className="h-3 w-3" />
                        <span className="text-xs">Définir principal</span>
                      </Button>
                    )}

                    {onRemove && parents.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onRemove(parent.parentId)}
                        className="h-8 gap-1 text-destructive hover:text-destructive"
                        title="Retirer ce parent"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span className="text-xs">Retirer</span>
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Message d'information */}
      {parents.length === 1 && (
        <p className="text-xs text-muted-foreground">
          Au moins un parent est requis. Le parent unique est automatiquement défini comme principal.
        </p>
      )}

      {parents.length === maxParents && (
        <p className="text-xs text-muted-foreground">
          Limite de {maxParents} parents atteinte.
        </p>
      )}
    </div>
  );
}
