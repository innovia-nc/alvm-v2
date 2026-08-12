// @vitest-environment jsdom
/**
 * Verrou anti-régression BUG-001 (R-B) — stabilité référentielle de useServerPagination
 *
 * Cause racine du bug : le hook retournait un objet non mémoïsé (fonctions recréées
 * à chaque render) → instabilité référentielle → useEffect dans DataTableServer
 * se re-déclenchait en boucle, parasitant l'application du filtre de recherche.
 *
 * Fix : useCallback sur chaque fonction + useMemo sur l'objet retourné.
 *
 * Ce test garantit que toute régression future sur la mémoïsation sera détectée
 * avant de casser silencieusement les 13+ tables server-side qui consomment ce hook.
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useServerPagination } from '@/hooks/use-server-pagination';

describe('useServerPagination — stabilité référentielle (verrou R-B / BUG-001)', () => {
  // ---------------------------------------------------------------------------
  // 1. Stabilité référentielle : aucun changement d'état → mêmes références
  // ---------------------------------------------------------------------------

  it('retourne le même objet (useMemo) entre deux renders sans changement d\'état', () => {
    const { result, rerender } = renderHook(() =>
      useServerPagination({ defaultPageSize: 20, defaultPage: 1 }),
    );

    const refBefore = result.current;
    rerender();
    const refAfter = result.current;

    expect(refAfter).toBe(refBefore);
  });

  it('conserve la même référence pour setPage entre deux renders sans changement d\'état', () => {
    const { result, rerender } = renderHook(() =>
      useServerPagination({ defaultPageSize: 20, defaultPage: 1 }),
    );

    const fnBefore = result.current.setPage;
    rerender();

    expect(result.current.setPage).toBe(fnBefore);
  });

  it('conserve la même référence pour setPageSize entre deux renders sans changement d\'état', () => {
    const { result, rerender } = renderHook(() =>
      useServerPagination({ defaultPageSize: 20, defaultPage: 1 }),
    );

    const fnBefore = result.current.setPageSize;
    rerender();

    expect(result.current.setPageSize).toBe(fnBefore);
  });

  it('conserve la même référence pour resetToFirstPage entre deux renders sans changement d\'état', () => {
    const { result, rerender } = renderHook(() =>
      useServerPagination({ defaultPageSize: 20, defaultPage: 1 }),
    );

    const fnBefore = result.current.resetToFirstPage;
    rerender();

    expect(result.current.resetToFirstPage).toBe(fnBefore);
  });

  it('conserve la même référence pour goToPrevPage entre deux renders sans changement d\'état', () => {
    const { result, rerender } = renderHook(() =>
      useServerPagination({ defaultPageSize: 20, defaultPage: 1 }),
    );

    const fnBefore = result.current.goToPrevPage;
    rerender();

    expect(result.current.goToPrevPage).toBe(fnBefore);
  });

  it('conserve la même référence pour goToNextPage entre deux renders sans changement d\'état', () => {
    const { result, rerender } = renderHook(() =>
      useServerPagination({ defaultPageSize: 20, defaultPage: 1 }),
    );

    const fnBefore = result.current.goToNextPage;
    rerender();

    expect(result.current.goToNextPage).toBe(fnBefore);
  });

  it('conserve la même référence pour getTotalPages entre deux renders sans changement d\'état', () => {
    const { result, rerender } = renderHook(() =>
      useServerPagination({ defaultPageSize: 20, defaultPage: 1 }),
    );

    const fnBefore = result.current.getTotalPages;
    rerender();

    expect(result.current.getTotalPages).toBe(fnBefore);
  });

  it('conserve la même référence pour hasNextPage entre deux renders sans changement d\'état', () => {
    const { result, rerender } = renderHook(() =>
      useServerPagination({ defaultPageSize: 20, defaultPage: 1 }),
    );

    const fnBefore = result.current.hasNextPage;
    rerender();

    expect(result.current.hasNextPage).toBe(fnBefore);
  });

  // ---------------------------------------------------------------------------
  // 2. Invalidation correcte : après setPage, la référence change et l'état est mis à jour
  // ---------------------------------------------------------------------------

  it('invalide la référence de l\'objet (useMemo recalcule) après setPage', () => {
    const { result } = renderHook(() =>
      useServerPagination({ defaultPageSize: 20, defaultPage: 1 }),
    );

    const refBefore = result.current;

    act(() => {
      result.current.setPage(2);
    });

    expect(result.current).not.toBe(refBefore);
  });

  it('met à jour page après setPage(2)', () => {
    const { result } = renderHook(() =>
      useServerPagination({ defaultPageSize: 20, defaultPage: 1 }),
    );

    act(() => {
      result.current.setPage(2);
    });

    expect(result.current.page).toBe(2);
  });

  it('met à jour page après setPageSize et invalide getTotalPages (dépend de pageSize)', () => {
    const { result } = renderHook(() =>
      useServerPagination({ defaultPageSize: 20, defaultPage: 1 }),
    );

    const getTotalPagesBefore = result.current.getTotalPages;

    act(() => {
      result.current.setPageSize(10);
    });

    // getTotalPages dépend de pageSize, donc sa référence doit changer
    expect(result.current.getTotalPages).not.toBe(getTotalPagesBefore);
    expect(result.current.pageSize).toBe(10);
  });

  // ---------------------------------------------------------------------------
  // 3. Comportement fonctionnel de base
  // ---------------------------------------------------------------------------

  it('retourne les valeurs initiales par défaut', () => {
    const { result } = renderHook(() => useServerPagination());

    expect(result.current.page).toBe(1);
    expect(result.current.pageSize).toBe(20);
    expect(result.current.offset).toBe(0);
    expect(result.current.limit).toBe(20);
    expect(result.current.hasPrevPage).toBe(false);
  });

  it('applique les options defaultPage et defaultPageSize', () => {
    const { result } = renderHook(() =>
      useServerPagination({ defaultPageSize: 50, defaultPage: 3 }),
    );

    expect(result.current.page).toBe(3);
    expect(result.current.pageSize).toBe(50);
    expect(result.current.offset).toBe(100); // (3-1) * 50
    expect(result.current.limit).toBe(50);
  });

  it('resetToFirstPage ramène page à 1', () => {
    const { result } = renderHook(() =>
      useServerPagination({ defaultPageSize: 20, defaultPage: 5 }),
    );

    expect(result.current.page).toBe(5);

    act(() => {
      result.current.resetToFirstPage();
    });

    expect(result.current.page).toBe(1);
  });

  it('goToNextPage incrémente la page sans dépasser totalPages', () => {
    const { result } = renderHook(() =>
      useServerPagination({ defaultPageSize: 10, defaultPage: 3 }),
    );

    act(() => {
      result.current.goToNextPage(5);
    });
    expect(result.current.page).toBe(4);

    act(() => {
      result.current.goToNextPage(5);
    });
    expect(result.current.page).toBe(5);

    // Ne dépasse pas totalPages
    act(() => {
      result.current.goToNextPage(5);
    });
    expect(result.current.page).toBe(5);
  });

  it('goToPrevPage décrémente la page sans descendre en dessous de 1', () => {
    const { result } = renderHook(() =>
      useServerPagination({ defaultPageSize: 10, defaultPage: 2 }),
    );

    act(() => {
      result.current.goToPrevPage();
    });
    expect(result.current.page).toBe(1);

    // Ne descend pas en dessous de 1
    act(() => {
      result.current.goToPrevPage();
    });
    expect(result.current.page).toBe(1);
  });

  it('hasPrevPage est false en page 1 et true en page 2+', () => {
    const { result } = renderHook(() =>
      useServerPagination({ defaultPageSize: 10, defaultPage: 1 }),
    );

    expect(result.current.hasPrevPage).toBe(false);

    act(() => {
      result.current.setPage(2);
    });

    expect(result.current.hasPrevPage).toBe(true);
  });

  it('getTotalPages calcule correctement', () => {
    const { result } = renderHook(() =>
      useServerPagination({ defaultPageSize: 10, defaultPage: 1 }),
    );

    expect(result.current.getTotalPages(0)).toBe(1);    // cas limite
    expect(result.current.getTotalPages(10)).toBe(1);   // exact
    expect(result.current.getTotalPages(11)).toBe(2);   // déborde
    expect(result.current.getTotalPages(45)).toBe(5);   // Math.ceil(45/10)
  });

  it('hasNextPage retourne true si page < totalPages, false sinon', () => {
    const { result } = renderHook(() =>
      useServerPagination({ defaultPageSize: 10, defaultPage: 1 }),
    );

    expect(result.current.hasNextPage(5)).toBe(true);   // page 1 < 5
    expect(result.current.hasNextPage(1)).toBe(false);  // page 1 == 1

    act(() => {
      result.current.setPage(3);
    });

    expect(result.current.hasNextPage(5)).toBe(true);   // page 3 < 5
    expect(result.current.hasNextPage(3)).toBe(false);  // page 3 == 3
  });

  it('offset est recalculé correctement après navigation', () => {
    const { result } = renderHook(() =>
      useServerPagination({ defaultPageSize: 20, defaultPage: 1 }),
    );

    expect(result.current.offset).toBe(0); // (1-1)*20

    act(() => {
      result.current.setPage(3);
    });

    expect(result.current.offset).toBe(40); // (3-1)*20
    expect(result.current.limit).toBe(20);
  });
});
