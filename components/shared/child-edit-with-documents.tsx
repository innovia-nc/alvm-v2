/**
 * Child Edit with Documents Component
 *
 * Composant wrapper qui combine le formulaire d'édition d'enfant
 * avec la section documents (uniquement en mode édition).
 */

'use client';

import { ChildForm } from '@/components/staff/children/child-form';
import { ChildDocumentsSection } from '@/components/shared/child-documents-section';

// ============================================================================
// TYPES
// ============================================================================

interface ChildData {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: Date;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  medicalInfo: {
    allergies: string[];
    medications: string[];
    conditions: string[];
    diet_restrictions: string[];
    notes: string;
  };
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelation: string | null;
  parents: Array<{
    parentId: string;
    isPrimary: boolean;
    relationship: 'mother' | 'father' | 'guardian' | 'step_mother' | 'step_father' | 'grandparent' | 'other' | null;
  }>;
}

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

export function ChildEditWithDocuments({
  child,
  userRole,
}: ChildEditWithDocumentsProps) {
  return (
    <div className="space-y-8">
      {/* Formulaire d'édition */}
      <div className="max-w-2xl">
        <ChildForm mode="edit" initialData={child as any} />
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
