'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';
import { useBreadcrumbOverride } from './breadcrumb-provider';

// Mapping des segments d'URL vers labels lisibles
const segmentLabels: Record<string, string> = {
  // Espaces principaux
  dashboard: 'Tableau de Bord',
  parent: 'Espace Parent',
  staff: 'Espace Personnel',
  admin: 'Administration',

  // Sections principales
  children: 'Enfants',
  camps: 'Camps',
  registrations: 'Inscriptions',
  invoices: 'Factures',
  payments: 'Paiements',
  refunds: 'Remboursements',
  'credit-notes': 'Avoirs',
  documents: 'Documents',
  users: 'Utilisateurs',
  parents: 'Parents',

  // Paramètres et configuration
  settings: 'Paramètres',
  accounting: 'Comptabilité',
  'camp-types': 'Types de Camps',
  'payment-methods': 'Méthodes de Paiement',

  // Exports et rapports
  fec: 'Export FEC',
  export: 'Export',

  // Actions
  new: 'Nouveau',
  edit: 'Modifier',
};

interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const overrideItems = useBreadcrumbOverride();

  const breadcrumbs = React.useMemo(() => {
    // If there's an override from context, use it
    if (overrideItems) {
      return overrideItems;
    }

    // Otherwise, generate automatic breadcrumbs from pathname
    const segments = pathname.split('/').filter(Boolean);
    const items: BreadcrumbItem[] = [];

    let currentPath = '';
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (!segment) continue;

      currentPath += `/${segment}`;

      // Segments à toujours masquer
      if (segment === 'dashboard') continue;

      // Masquer les IDs dynamiques (segments qui ressemblent à des UUIDs ou IDs numériques)
      // Format UUID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment);
      const isNumericId = /^\d+$/.test(segment);
      if (isUUID || isNumericId) continue;

      // Masquer 'users' quand suivi de 'parents' ou 'staff' (redondant)
      if (segment === 'users' && i + 1 < segments.length) {
        const nextSegment = segments[i + 1];
        if (nextSegment === 'parents' || nextSegment === 'staff') {
          continue;
        }
      }

      // Masquer 'settings' quand suivi d'une sous-section (la sous-section suffit)
      if (segment === 'settings' && i + 1 < segments.length) {
        const nextSegment = segments[i + 1];
        if (nextSegment === 'camp-types' || nextSegment === 'payment-methods') {
          continue;
        }
      }

      items.push({
        href: currentPath,
        label: segmentLabels[segment] || segment,
      });
    }

    return items;
  }, [pathname, overrideItems]);

  if (breadcrumbs.length === 0) {
    return null;
  }

  return (
    <nav aria-label="Breadcrumb" className="flex items-center space-x-1 text-sm">
      <Link
        href="/dashboard"
        className="flex items-center text-muted-foreground hover:text-foreground transition-colors"
      >
        <Home className="h-4 w-4" />
      </Link>

      {breadcrumbs.map((item, index) => {
        const isLast = index === breadcrumbs.length - 1;
        const key = item.href || `${item.label}-${index}`;

        return (
          <React.Fragment key={key}>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />

            {isLast || !item.href ? (
              <span className="font-medium text-foreground">{item.label}</span>
            ) : (
              <Link
                href={item.href}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {item.label}
              </Link>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
