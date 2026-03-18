'use client';

import { useEffect, useState } from 'react';

/**
 * Hook pour débouncer une valeur
 *
 * Retarde la mise à jour d'une valeur jusqu'à ce qu'un certain délai
 * se soit écoulé depuis la dernière modification. Utile pour optimiser
 * les recherches et filtres en temps réel.
 *
 * @param value - Valeur à débouncer
 * @param delay - Délai en millisecondes (défaut: 300ms)
 * @returns Valeur débouncée
 *
 * @example
 * ```tsx
 * const [search, setSearch] = useState('');
 * const debouncedSearch = useDebouncedValue(search, 300);
 *
 * // L'input est réactif
 * <Input value={search} onChange={(e) => setSearch(e.target.value)} />
 *
 * // Le filtrage utilise la valeur débouncée (300ms après la dernière frappe)
 * const filtered = data.filter(item =>
 *   item.name.includes(debouncedSearch)
 * );
 * ```
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Définir un timer pour mettre à jour la valeur après le délai
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Nettoyer le timer si la valeur change avant la fin du délai
    // Cela évite les mises à jour inutiles
    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}
