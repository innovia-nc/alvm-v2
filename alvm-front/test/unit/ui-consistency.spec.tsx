// @vitest-environment jsdom
import * as React from 'react';
import Link from 'next/link';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmptyState } from '@/components/shared/empty-state';
import { LoadingState } from '@/components/shared/loading-state';
import { ErrorState } from '@/components/shared/error-state';
import { FormActions } from '@/components/shared/form-actions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { DataTable } from '@/components/ui/data-table';
import { DataTableServer } from '@/components/ui/data-table-server';
import { useServerPagination } from '@/hooks/use-server-pagination';

afterEach(cleanup);
describe('Composants communs des écrans', () => {
  it('rend un état vide avec une action utilisable et annonce le chargement', () => {
    render(
      <>
        <EmptyState
          title="Aucun enfant"
          description="Ajoutez un enfant pour commencer."
          action={<Link href="/dashboard/parent/children/new">Ajouter un enfant</Link>}
        />
        <LoadingState label="Chargement des enfants…" />
      </>,
    );
    expect(screen.getByRole('heading', { name: 'Aucun enfant' })).toBeTruthy();
    expect(screen.getByRole('link').getAttribute('href')).toBe('/dashboard/parent/children/new');
    expect(screen.getByRole('status').textContent).toBe('Chargement des enfants…');
  });
  it('permet de relancer une requête sans soumettre le formulaire environnant', async () => {
    const retry = vi.fn(),
      submit = vi.fn((e) => e.preventDefault());
    render(
      <form onSubmit={submit}>
        <ErrorState onRetry={retry} />
      </form>,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(retry).toHaveBeenCalledOnce();
    expect(submit).not.toHaveBeenCalled();
  });
  it('préserve les actions Annuler et Enregistrer et leur ordre de tabulation', async () => {
    const cancel = vi.fn(),
      submit = vi.fn((e) => e.preventDefault());
    const user = userEvent.setup();
    render(
      <form onSubmit={submit}>
        <FormActions>
          <Button type="button" onClick={cancel}>
            Annuler
          </Button>
          <Button type="submit">Enregistrer</Button>
        </FormActions>
      </form>,
    );
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Annuler' }));
    await user.keyboard('{Enter}');
    expect(cancel).toHaveBeenCalledOnce();
    expect(submit).not.toHaveBeenCalled();
    await user.tab();
    await user.keyboard('{Enter}');
    expect(submit).toHaveBeenCalledOnce();
  });
  it('ferme un dialogue avec le bouton nommé en français et restitue le focus', async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger asChild>
          <Button>Ouvrir</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle>Modifier le dossier</DialogTitle>
          <DialogDescription>Vérifiez les coordonnées.</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    await user.click(screen.getByRole('button', { name: 'Ouvrir' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Ouvrir' }));
  });
  it('rend également le focus au bouton qui ouvre un dialogue contrôlé sans DialogTrigger', async () => {
    function ControlledDialog() {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <Button onClick={() => setOpen(true)}>Modifier</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
              <DialogTitle>Modifier</DialogTitle>
              <DialogDescription>Coordonnées</DialogDescription>
            </DialogContent>
          </Dialog>
        </>
      );
    }
    const user = userEvent.setup();
    render(<ControlledDialog />);
    const opener = screen.getByRole('button', { name: 'Modifier' });
    await user.click(opener);
    await user.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(document.activeElement).toBe(opener);
  });
  it('offre le même tri clavier dans les tableaux locaux et serveur', async () => {
    const user = userEvent.setup();
    render(
      <DataTable
        columns={[{ accessorKey: 'name', header: 'Nom' }]}
        data={[{ name: 'Zoé' }, { name: 'Alice' }]}
      />,
    );
    screen.getByRole('button', { name: 'Nom' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('columnheader').getAttribute('aria-sort')).toBe('ascending');
    expect(screen.getAllByRole('cell')[0].textContent).toBe('Alice');
    await user.keyboard(' ');
    expect(screen.getAllByRole('cell')[0].textContent).toBe('Zoé');
  });
  it('synchronise une remise à zéro externe des filtres sans soumettre de recherche supplémentaire', async () => {
    const changed = vi.fn();
    function Harness({ search }: { search: string }) {
      const pagination = useServerPagination();
      return (
        <DataTableServer
          columns={[{ accessorKey: 'name', header: 'Nom' }]}
          data={[{ name: 'Alice' }]}
          totalCount={1}
          pagination={pagination}
          searchKey="name"
          search={search}
          onSearchChange={changed}
        />
      );
    }
    const user = userEvent.setup();
    const view = render(<Harness search="Alice" />);
    expect(screen.getByRole('textbox').getAttribute('value')).toBe('Alice');
    await user.type(screen.getByRole('textbox'), ' brouillon');
    expect(changed).not.toHaveBeenCalled();
    view.rerender(<Harness search="" />);
    expect(screen.getByRole('textbox').getAttribute('value')).toBe('');
    expect(changed).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Effacer la recherche' })).toBeNull();
  });
});
