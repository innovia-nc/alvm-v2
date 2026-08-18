'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Star, User, Mail, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

// Prive au module : aucun autre fichier n'importe cette forme — les ecrans qui
// affichent des parents associes passent par ce composant.
interface ChildParent {
  id: string;
  parentId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  homePhone?: string | null;
  workPhone?: string | null;
  isPrimary: boolean;
  // Widened to `string | null` to tolerate legacy values in BDD outside the
  // canonical enum (see server/routers/children.ts B1 fix). The relation label
  // lookup gracefully degrades to the raw string for unknown values.
  relationship?: string | null;
}

interface ChildParentsListProps {
  parents: ChildParent[];
  className?: string;
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
// COMPOSANT (Lecture seule)
// ============================================================================

export function ChildParentsList({ parents, className }: ChildParentsListProps) {
  if (parents.length === 0) {
    return (
      <Card className={cn('border-dashed', className)}>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center text-muted-foreground">
            <User className="mx-auto h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">Aucun parent associé</p>
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
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base">
          Parent{parents.length > 1 ? 's' : ''} associé{parents.length > 1 ? 's' : ''}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3">
          {sortedParents.map((parent) => (
            <div
              key={parent.parentId}
              className={cn(
                'rounded-lg border p-4 transition-colors',
                parent.isPrimary && 'border-primary bg-primary/5'
              )}
            >
              {/* Header avec nom et badge principal */}
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="font-medium">
                    {parent.firstName} {parent.lastName}
                  </span>
                </div>

                <div className="flex gap-1 flex-shrink-0">
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
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">{parent.email}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">{parent.phone}</span>
                </div>
                {parent.homePhone && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate">Domicile : {parent.homePhone}</span>
                  </div>
                )}
                {parent.workPhone && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate">Pro : {parent.workPhone}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Informations complémentaires */}
        {parents.length > 1 && (
          <p className="text-xs text-muted-foreground mt-4">
            Cet enfant a {parents.length} parents associés.
            {sortedParents[0]?.isPrimary && (
              <> {sortedParents[0].firstName} {sortedParents[0].lastName} est le parent principal (facturation et communication).</>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
