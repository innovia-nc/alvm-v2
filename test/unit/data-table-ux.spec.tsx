// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTableServer } from '@/components/ui/data-table-server';
import { useServerPagination } from '@/hooks/use-server-pagination';

function Harness({ onSearch = vi.fn(), loading = false }) {
  const pagination = useServerPagination({ defaultPageSize: 20 });
  return (
    <DataTableServer
      columns={[{ accessorKey: 'name', header: 'Nom' }]}
      data={loading ? [] : [{ name: 'Martin' }]}
      isLoading={loading}
      totalCount={500}
      pagination={pagination}
      searchKey="name"
      sortableColumns={['name']}
      onSearchChange={onSearch}
    />
  );
}
afterEach(cleanup);
describe('Listes — commandes accessibles', () => {
  it('trie au clavier dans les deux directions et annonce le tri', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const button = screen.getByRole('button', { name: 'Nom' });
    button.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('columnheader').getAttribute('aria-sort')).toBe('ascending');
    await user.keyboard(' ');
    expect(screen.getByRole('columnheader').getAttribute('aria-sort')).toBe('descending');
  });
  it('conserve le focus du tri pendant un chargement serveur', async () => {
    const pagination = {
      sorting: [],
      onSortingChange: vi.fn(),
      getTotalPages: () => 1,
      page: 1,
      pageSize: 20,
    } as unknown as ReturnType<typeof useServerPagination>;
    const props = {
      columns: [{ accessorKey: 'name', header: 'Nom' }],
      data: [{ name: 'Martin' }],
      totalCount: 1,
      pagination,
      sortableColumns: ['name'],
    };
    const view = render(<DataTableServer {...props} />);
    const button = screen.getByRole('button', { name: 'Nom' });
    button.focus();
    view.rerender(<DataTableServer {...props} data={[]} totalCount={0} isLoading />);
    expect(document.activeElement).toBe(button);
    expect(screen.getByRole('status', { name: 'Chargement des résultats' })).toBeTruthy();
    view.rerender(<DataTableServer {...props} />);
    expect(document.activeElement).toBe(button);
  });
  it('conserve le cycle ascendant puis descendant même sans données pendant le chargement', async () => {
    const user = userEvent.setup();
    const view = render(<Harness />);
    screen.getByRole('button', { name: 'Nom' }).focus();
    await user.keyboard('{Enter}');
    view.rerender(<Harness loading />);
    await user.keyboard(' ');
    expect(screen.getByRole('columnheader').getAttribute('aria-sort')).toBe('descending');
  });
  it('efface la recherche validée et revient à la première page', async () => {
    const onSearch = vi.fn();
    const user = userEvent.setup();
    render(<Harness onSearch={onSearch} />);
    await user.type(screen.getByRole('textbox'), 'Martin{Enter}');
    await user.click(screen.getByRole('link', { name: 'Aller à la page suivante' }));
    expect(screen.getByText('Page 2 sur 25')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Effacer la recherche' }));
    expect(onSearch.mock.calls).toEqual([['Martin'], ['']]);
    expect(screen.getByText('Page 1 sur 25')).toBeTruthy();
    expect(screen.getByRole('textbox').getAttribute('value')).toBe('');
  });
  it('ne soumet pas une saisie non validée lors de son effacement', async () => {
    const onSearch = vi.fn();
    const user = userEvent.setup();
    render(<Harness onSearch={onSearch} />);
    await user.type(screen.getByRole('textbox'), 'brouillon');
    await user.click(screen.getByRole('button', { name: 'Effacer la recherche' }));
    expect(onSearch).not.toHaveBeenCalled();
  });
  it('expose les limites de pagination aux technologies d’assistance', async () => {
    render(<Harness />);
    const previous = screen.getByRole('link', { name: 'Aller à la page précédente' });
    expect(previous.getAttribute('aria-disabled')).toBe('true');
    expect(previous.getAttribute('tabindex')).toBe('-1');
    expect(screen.getByRole('combobox', { name: 'Résultats par page' })).toBeTruthy();
  });
});
