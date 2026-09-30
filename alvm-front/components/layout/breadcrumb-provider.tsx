'use client';

/**
 * BreadcrumbProvider - Context provider for breadcrumb overrides
 *
 * Allows pages to override automatic breadcrumbs with server-side data
 * (e.g., child names, credit note numbers) while preserving the automatic
 * breadcrumb system for other pages.
 *
 * Usage:
 * ```tsx
 * <BreadcrumbProvider items={[
 *   { href: '/dashboard/staff', label: 'Dashboard' },
 *   { href: '/dashboard/staff/children', label: 'Enfants' },
 *   { href: `/dashboard/staff/children/${id}/edit`, label: `${child.firstName} ${child.lastName}` },
 *   { label: 'Parents' }
 * ]}>
 *   <YourPageContent />
 * </BreadcrumbProvider>
 * ```
 */

import React, { createContext, useContext } from 'react';

// ============================================================================
// TYPES
// ============================================================================

export interface BreadcrumbItem {
  href?: string;
  label: string;
}

interface BreadcrumbContextValue {
  items: BreadcrumbItem[] | null;
}

// ============================================================================
// CONTEXT
// ============================================================================

const BreadcrumbContext = createContext<BreadcrumbContextValue>({
  items: null,
});

// ============================================================================
// PROVIDER
// ============================================================================

interface BreadcrumbProviderProps {
  items: BreadcrumbItem[];
  children: React.ReactNode;
}

export function BreadcrumbProvider({ items, children }: BreadcrumbProviderProps) {
  return (
    <BreadcrumbContext.Provider value={{ items }}>
      {children}
    </BreadcrumbContext.Provider>
  );
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * Hook to access breadcrumb override items
 * @returns Breadcrumb items if override is set, null otherwise
 */
export function useBreadcrumbOverride(): BreadcrumbItem[] | null {
  const context = useContext(BreadcrumbContext);
  return context.items;
}
