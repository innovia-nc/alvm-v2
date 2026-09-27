// @vitest-environment jsdom
/**
 * Création d'un enfant : la carte du parent sélectionné doit le désigner
 * (nom, email, téléphone). Défaut trouvé par la recette E2E SaaS 3.0.0
 * (FAM-02) : le formulaire ne conservait que l'identifiant et affichait une
 * carte vide — impossible de vérifier qu'on a choisi le bon parent parmi des
 * homonymes.
 */
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/trpc/client', () => {
  const mutation = () => ({ mutateAsync: vi.fn(), isPending: false });
  return {
    trpc: {
      useUtils: () => ({
        children: { list: { invalidate: vi.fn() }, getById: { invalidate: vi.fn() } },
      }),
      children: { create: { useMutation: mutation }, update: { useMutation: mutation } },
    },
  };
});
// La recherche (requête tRPC) est hors sujet : elle renvoie un parent choisi.
vi.mock('@/components/shared/parent-search-dialog', () => ({
  ParentSearchDialog: ({
    open,
    onSelect,
    onOpenChange,
  }: {
    open: boolean;
    onSelect: (parent: Record<string, unknown>) => void;
    onOpenChange: (open: boolean) => void;
  }) =>
    open ? (
      <button
        type="button"
        onClick={() => {
          onSelect({
            id: '',
            parentId: '6f1c1f1e-3b8a-4c1e-9a52-1b2c3d4e5f60',
            firstName: 'Claire',
            lastName: 'Recette',
            email: 'claire.recette@familles.test',
            phone: '+687 12 34 56',
            isPrimary: true,
            relationship: 'mother',
          });
          onOpenChange(false);
        }}
      >
        Choisir Claire Recette
      </button>
    ) : null,
}));

import { ChildForm } from '@/components/staff/children/child-form';

afterEach(cleanup);

describe('ChildForm — parent sélectionné à la création', () => {
  it('affiche le nom, l’email et le téléphone du parent choisi', async () => {
    const user = userEvent.setup();
    render(<ChildForm mode="create" basePath="/dashboard/admin/children" />);

    expect(screen.getByText('Aucun parent sélectionné')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Ajouter un parent/ }));
    await user.click(screen.getByRole('button', { name: 'Choisir Claire Recette' }));

    expect(screen.getByText('1 parent sélectionné')).toBeTruthy();
    expect(screen.getByText('Claire Recette')).toBeTruthy();
    expect(screen.getByText('claire.recette@familles.test')).toBeTruthy();
    expect(screen.getByText('+687 12 34 56')).toBeTruthy();
    expect(screen.getByText('Mère')).toBeTruthy();
  });
});
