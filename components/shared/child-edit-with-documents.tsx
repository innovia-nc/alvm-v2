/**
 * Child Edit with Documents Component
 *
 * Composant wrapper qui combine le formulaire d'édition d'enfant
 * avec la section documents (uniquement en mode édition).
 */

'use client';

import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@/server/trpc/router';
import { ChildForm } from '@/components/staff/children/child-form';
import { ChildDocumentsSection } from '@/components/shared/child-documents-section';

// ============================================================================
// TYPES
// ============================================================================

// Shape réelle servie par le routeur — évite une interface locale qui dérive
// du contrat (le cast `as any` masquait des champs manquants : ecole, parents enrichis).
type ChildData = NonNullable<inferRouterOutputs<AppRouter>['children']['getById']>;

interface ChildEditWithDocumentsProps {
  /**
   * Données de l'enfant à éditer
   */
  child: ChildData;

  /**
   * Rôle de l'utilisateur connecté
   */
  userRole: 'PARENT' | 'STAFF' | 'ADMIN';
}

// ============================================================================
// COMPONENT
// ============================================================================

const CHILDREN_BASE_PATH: Record<'PARENT' | 'STAFF' | 'ADMIN', string> = {
  PARENT: '/dashboard/parent/children',
  STAFF: '/dashboard/staff/children',
  ADMIN: '/dashboard/admin/children',
};

export function ChildEditWithDocuments({
  child,
  userRole,
}: ChildEditWithDocumentsProps) {
  const basePath = CHILDREN_BASE_PATH[userRole];
  return (
    <div className="space-y-8">
      {/* Formulaire d'édition */}
      <div className="max-w-2xl">
        <ChildForm mode="edit" initialData={child} basePath={basePath} />
      </div>

      {/* Section documents (en pleine largeur) */}
      <div className="max-w-4xl">
        <ChildDocumentsSection
          childId={child.id}
          userRole={userRole}
        />
      </div>
    </div>
  );
}
