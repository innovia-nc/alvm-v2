// @vitest-environment jsdom
/**
 * Verrou anti-régression — liens morts du menu utilisateur.
 *
 * Le menu avatar proposait « Mon Profil » (`/dashboard/profile`) et
 * « Paramètres » (`/dashboard/settings`) à TOUS les rôles. Aucune de ces deux
 * routes n'existe dans `app/` : les trois rôles cliquaient sur un 404.
 *
 * Ce test verrouille les deux garanties du correctif :
 *  - aucune entrée du menu ne vise une route inexistante ;
 *  - « Paramètres » n'apparaît que pour un ADMIN (settings.updateBulk est une
 *    adminProcedure) et pointe sur l'écran réel `/dashboard/admin/settings`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const pushMock = vi.fn();
const useSessionMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
}));

vi.mock('next-auth/react', () => ({
  useSession: () => useSessionMock(),
  signOut: vi.fn(),
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'light', setTheme: vi.fn() }),
}));

import { DashboardHeader } from '@/components/layout/dashboard-header';

/** Routes visées par l'ancien menu et qui n'ont jamais existé dans `app/`. */
const ROUTES_INEXISTANTES = ['/dashboard/profile', '/dashboard/settings'];

function sessionPour(role: 'ADMIN' | 'STAFF' | 'PARENT') {
  return {
    status: 'authenticated',
    data: {
      user: { role, email: 'test@alvm.nc', name: 'Test Utilisateur' },
    },
  };
}

/** Radix s'appuie sur des API pointer absentes de jsdom. */
function stubApisPointer() {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
}

async function ouvrirMenuUtilisateur() {
  const user = userEvent.setup();
  const trigger = screen
    .getAllByRole('button')
    .find((b) => b.querySelector('[class*="rounded-full"]') || b.className.includes('rounded-full'));

  await user.click(trigger!);
  return user;
}

describe('DashboardHeader — menu utilisateur sans lien mort', () => {
  beforeEach(() => {
    pushMock.mockClear();
    stubApisPointer();
  });

  afterEach(() => {
    cleanup();
  });

  // ---------------------------------------------------------------------------
  // 1. Le lien mort « Mon Profil » a disparu pour tous les rôles
  // ---------------------------------------------------------------------------

  it.each(['ADMIN', 'STAFF', 'PARENT'] as const)(
    'ne propose plus « Mon Profil » à un %s (aucun écran ni procédure self-service)',
    async (role) => {
      useSessionMock.mockReturnValue(sessionPour(role));
      render(<DashboardHeader />);
      await ouvrirMenuUtilisateur();

      expect(screen.queryByText('Mon Profil')).toBeNull();
    },
  );

  // ---------------------------------------------------------------------------
  // 2. « Paramètres » : réservé à l'ADMIN, et pointant sur l'écran réel
  // ---------------------------------------------------------------------------

  it('propose « Paramètres » à un ADMIN et navigue vers /dashboard/admin/settings', async () => {
    useSessionMock.mockReturnValue(sessionPour('ADMIN'));
    render(<DashboardHeader />);
    const user = await ouvrirMenuUtilisateur();

    await user.click(screen.getByText('Paramètres'));

    expect(pushMock).toHaveBeenCalledWith('/dashboard/admin/settings');
  });

  it.each(['STAFF', 'PARENT'] as const)(
    'ne propose pas « Paramètres » à un %s (settings.updateBulk est une adminProcedure)',
    async (role) => {
      useSessionMock.mockReturnValue(sessionPour(role));
      render(<DashboardHeader />);
      await ouvrirMenuUtilisateur();

      expect(screen.queryByText('Paramètres')).toBeNull();
    },
  );

  // ---------------------------------------------------------------------------
  // 3. Verrou général : aucune navigation vers une route inexistante
  // ---------------------------------------------------------------------------

  it.each(['ADMIN', 'STAFF', 'PARENT'] as const)(
    'aucune entrée du menu ne navigue vers une route inexistante (%s)',
    async (role) => {
      useSessionMock.mockReturnValue(sessionPour(role));
      render(<DashboardHeader />);
      const user = await ouvrirMenuUtilisateur();

      const entrees = screen.getAllByRole('menuitem');
      for (const entree of entrees) {
        await user.click(entree);
      }

      const routesVisees = pushMock.mock.calls.map(([route]) => route);
      for (const morte of ROUTES_INEXISTANTES) {
        expect(routesVisees).not.toContain(morte);
      }
    },
  );
});
