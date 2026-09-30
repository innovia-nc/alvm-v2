// @vitest-environment jsdom
/**
 * US-UX-01 — la recherche ne se déclenche QUE sur validation.
 *
 * Constat corrigé : `DataTableServer` remontait le terme de recherche via un
 * debounce (300 ms puis 500 ms), ce qui provoquait un appel réseau à chaque
 * pause de frappe. Le composant ne notifie désormais le parent que sur
 * « Entrée » ou clic sur le bouton « Rechercher ».
 *
 * Ce test verrouille le contrat pour les ~19 tables serveur qui consomment
 * le composant (Parents, Enfants, ACM, Inscriptions, Factures, Personnel…).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTableServer } from '@/components/ui/data-table-server';
import { useServerPagination } from '@/hooks/use-server-pagination';

type Row = { id: string; name: string };

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'name', header: 'Nom' },
];

const rows: Row[] = [{ id: '1', name: 'Martin' }];

function Harness({ onSearchChange }: { onSearchChange: (s: string) => void }) {
  const pagination = useServerPagination({ defaultPageSize: 20 });

  return (
    <DataTableServer
      columns={columns}
      data={rows}
      totalCount={rows.length}
      pagination={pagination}
      searchKey="name"
      searchPlaceholder="Rechercher..."
      onSearchChange={onSearchChange}
    />
  );
}

afterEach(cleanup);

describe('DataTableServer — recherche sur validation (US-UX-01)', () => {
  it("ne déclenche aucune recherche pendant la frappe", async () => {
    const onSearchChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onSearchChange={onSearchChange} />);

    await user.type(screen.getByPlaceholderText('Rechercher...'), 'Dup');

    // Le debounce historique était de 300/500 ms : on laisse largement passer
    // ce délai pour prouver qu'aucun timer résiduel ne déclenche la recherche.
    vi.useFakeTimers();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    vi.useRealTimers();

    expect(onSearchChange).not.toHaveBeenCalled();
  });

  it('déclenche la recherche une seule fois sur « Entrée »', async () => {
    const onSearchChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onSearchChange={onSearchChange} />);

    await user.type(screen.getByPlaceholderText('Rechercher...'), 'Martin{Enter}');

    expect(onSearchChange).toHaveBeenCalledTimes(1);
    expect(onSearchChange).toHaveBeenCalledWith('Martin');
  });

  it('déclenche la recherche au clic sur le bouton « Rechercher »', async () => {
    const onSearchChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onSearchChange={onSearchChange} />);

    await user.type(screen.getByPlaceholderText('Rechercher...'), 'Martin');
    await user.click(screen.getByRole('button', { name: 'Rechercher' }));

    expect(onSearchChange).toHaveBeenCalledTimes(1);
    expect(onSearchChange).toHaveBeenCalledWith('Martin');
  });

  it('ne relance pas la recherche si le terme validé est inchangé', async () => {
    const onSearchChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onSearchChange={onSearchChange} />);

    const input = screen.getByPlaceholderText('Rechercher...');
    await user.type(input, 'Martin{Enter}');
    await user.type(input, '{Enter}');
    await user.click(screen.getByRole('button', { name: 'Rechercher' }));

    expect(onSearchChange).toHaveBeenCalledTimes(1);
  });

  it('remonte le terme vidé quand l\'utilisateur efface puis valide', async () => {
    const onSearchChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onSearchChange={onSearchChange} />);

    const input = screen.getByPlaceholderText('Rechercher...');
    await user.type(input, 'Martin{Enter}');
    await user.clear(input);
    await user.type(input, '{Enter}');

    expect(onSearchChange).toHaveBeenLastCalledWith('');
  });
});
