// @vitest-environment jsdom
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const state = vi.hoisted(() => ({ pathname: '/dashboard/admin', mobile: false }));
vi.mock('next/navigation', () => ({ usePathname: () => state.pathname }));
vi.mock('@/lib/hooks/use-media-query', () => ({ useMediaQuery: () => state.mobile }));
import { defaultFeatures } from '@/lib/features/catalog';
import { DashboardSidebar } from '@/components/layout/dashboard-sidebar';

afterEach(() => {
  cleanup();
  state.mobile = false;
});
describe('Navigation — repérage et changement de taille', () => {
  it.each([
    ['/dashboard/admin', '/dashboard/admin'],
    ['/dashboard/admin/users/parents/123/edit', '/dashboard/admin/users/parents'],
    ['/dashboard/admin/users/staff', '/dashboard/admin/users/staff'],
    ['/dashboard/admin/users/123', '/dashboard/admin/users'],
    ['/dashboard/admin/settings/payment-methods', '/dashboard/admin/settings/payment-methods'],
  ])('une seule destination active sur %s', (pathname, expected) => {
    state.pathname = pathname;
    render(<DashboardSidebar role="admin" />);
    const active = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page');
    expect(active).toHaveLength(1);
    expect(active[0].getAttribute('href')).toBe(expected);
  });
  it('conserve les noms accessibles une fois le menu réduit et rétablit les libellés sur mobile', async () => {
    state.pathname = '/dashboard/admin/users/parents';
    const user = userEvent.setup();
    const view = render(<DashboardSidebar role="admin" />);
    await user.click(screen.getByRole('button', { name: 'Réduire le menu' }));
    expect(screen.getByRole('link', { name: 'Parents / Clients' }).textContent).toBe('');
    state.mobile = true;
    view.rerender(<DashboardSidebar role="admin" />);
    await user.click(screen.getByRole('button', { name: 'Ouvrir le menu' }));
    expect(screen.getByRole('link', { name: 'Parents / Clients' }).textContent).toBe(
      'Parents / Clients',
    );
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Ouvrir le menu' }));
  });
});

it('affiche la navigation dédiée du super admin', () => {
  state.pathname = '/dashboard/super-admin';
  render(<DashboardSidebar role="super-admin" />);
  expect(screen.getByRole('link', { name: 'Associations' }).getAttribute('aria-current')).toBe(
    'page',
  );
  expect(screen.getByRole('link', { name: 'Configuration globale' }).getAttribute('href')).toBe(
    '/dashboard/super-admin/settings',
  );
});
it('masque les rubriques désactivées', () => {
  render(<DashboardSidebar role="admin" features={{ ...defaultFeatures, invoices: false }} />);
  expect(screen.queryByRole('link', { name: 'Factures' })).toBeNull();
  expect(screen.getByRole('link', { name: 'Paiements' })).toBeTruthy();
});
