'use client';

import { ApplicationName } from '@/components/providers/branding-provider';
import { featuresForPage, type FeatureState } from '@/lib/features/catalog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useMediaQuery } from '@/lib/hooks/use-media-query';
import { cn } from '@/lib/utils';
import {
  CalendarDays,
  ChevronLeft,
  CreditCard,
  FileCheck,
  FileText,
  Home,
  Menu,
  Receipt,
  RefreshCcw,
  Settings,
  Tag,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

interface DashboardSidebarProps {
  role: 'parent' | 'staff' | 'admin' | 'super-admin';
  features?: FeatureState;
}

// Configuration navigation par rôle
const navigationConfig: Record<string, NavSection[]> = {
  'super-admin': [
    {
      title: 'Super administration',
      items: [
        { title: 'Fonctionnalités', href: '/dashboard/super-admin', icon: Settings },
        { title: 'Configuration globale', href: '/dashboard/super-admin/settings', icon: Settings },
        { title: 'Intégrations et clés API', href: '/dashboard/super-admin/integrations', icon: Settings },
        { title: 'Comptes et accès', href: '/dashboard/super-admin/accounts', icon: Users },
        { title: 'Journal d’audit', href: '/dashboard/super-admin/audit', icon: FileText },
      ],
    },
  ],
  parent: [
    {
      title: '',
      items: [
        {
          title: 'Accueil',
          href: '/dashboard/parent',
          icon: Home,
        },
        {
          title: 'Camps Disponibles',
          href: '/dashboard/parent/camps',
          icon: CalendarDays,
        },
        {
          title: 'Mes Enfants',
          href: '/dashboard/parent/children',
          icon: Users,
        },
        {
          title: 'Mes Inscriptions',
          href: '/dashboard/parent/registrations',
          icon: FileText,
        },
        {
          title: 'Mes Factures',
          href: '/dashboard/parent/invoices',
          icon: Receipt,
        },
      ],
    },
  ],
  staff: [
    {
      title: '',
      items: [
        {
          title: 'Tableau de Bord',
          href: '/dashboard/staff',
          icon: Home,
        },
      ],
    },
    {
      title: 'Gestion des utilisateurs',
      items: [
        {
          title: 'Parents / Clients',
          href: '/dashboard/staff/parents',
          icon: Users,
        },
        {
          title: 'Enfants / Stagiaires',
          href: '/dashboard/staff/children',
          icon: Users,
        },
        {
          title: 'Personnel',
          href: '/dashboard/staff/users/staff',
          icon: Users,
        },
      ],
    },
    {
      title: 'Gestion des ACM',
      items: [
        {
          title: 'ACM',
          href: '/dashboard/staff/camps',
          icon: CalendarDays,
        },
        {
          title: 'Inscriptions',
          href: '/dashboard/staff/registrations',
          icon: FileText,
        },
      ],
    },
    {
      title: 'Gestion des factures',
      items: [
        {
          title: 'Factures',
          href: '/dashboard/staff/invoices',
          icon: Receipt,
        },
        {
          title: 'Paiements',
          href: '/dashboard/staff/payments',
          icon: CreditCard,
        },
        {
          title: 'Avoirs',
          href: '/dashboard/staff/credit-notes',
          icon: FileCheck,
        },
        {
          title: 'Remboursements',
          href: '/dashboard/staff/refunds',
          icon: RefreshCcw,
        },
      ],
    },
  ],
  admin: [
    {
      title: '',
      items: [
        {
          title: 'Tableau de Bord',
          href: '/dashboard/admin',
          icon: Home,
        },
      ],
    },
    {
      title: 'Gestion des utilisateurs',
      items: [
        {
          title: 'Parents / Clients',
          href: '/dashboard/admin/users/parents',
          icon: Users,
        },
        {
          title: 'Enfants / Stagiaires',
          href: '/dashboard/admin/children',
          icon: Users,
        },
        {
          title: 'Comptes et habilitations',
          href: '/dashboard/admin/users',
          icon: Users,
        },
        {
          title: 'Personnel',
          href: '/dashboard/admin/users/staff',
          icon: Users,
        },
      ],
    },
    {
      title: 'Gestion des ACM',
      items: [
        {
          title: 'ACM',
          href: '/dashboard/admin/camps',
          icon: CalendarDays,
        },
        {
          title: 'Inscriptions',
          href: '/dashboard/admin/registrations',
          icon: FileText,
        },
      ],
    },
    {
      title: 'Gestion des factures',
      items: [
        {
          title: 'Factures',
          href: '/dashboard/admin/invoices',
          icon: Receipt,
        },
        {
          title: 'Paiements',
          href: '/dashboard/admin/payments',
          icon: CreditCard,
        },
        {
          title: 'Avoirs',
          href: '/dashboard/admin/credit-notes',
          icon: FileCheck,
        },
        {
          title: 'Remboursements',
          href: '/dashboard/admin/refunds',
          icon: RefreshCcw,
        },
      ],
    },
    {
      title: 'Gestion de la configuration',
      items: [
        {
          title: 'Paramètres',
          href: '/dashboard/admin/settings',
          icon: Settings,
        },
        {
          title: "Types d'ACM",
          href: '/dashboard/admin/settings/camp-types',
          icon: Tag,
        },
        {
          title: 'Méthodes de Paiement',
          href: '/dashboard/admin/settings/payment-methods',
          icon: Receipt,
        },
        {
          title: 'Export FEC',
          href: '/dashboard/admin/fec/export',
          icon: FileText,
        },
      ],
    },
  ],
};

export function DashboardSidebar({ role, features }: DashboardSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const isMobile = useMediaQuery('(max-width: 767px)');

  const navSections = (navigationConfig[role] || [])
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) =>
          role === 'super-admin' ||
          !features ||
          featuresForPage(item.href).every((key) => features[key]),
      ),
    }))
    .filter((section) => section.items.length > 0);
  const compact = collapsed && !isMobile;
  // Only the most specific matching destination represents the current page.
  const activeHref = navSections
    .flatMap((section) => section.items)
    .filter((item) => pathname === item.href || pathname.startsWith(item.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  const NavContent = () => (
    <div className="flex h-full flex-col">
      {/* Logo et toggle collapse */}
      <div className="flex h-16 items-center justify-between border-b px-4">
        {!compact && (
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="min-w-0 break-words text-xl font-bold text-primary"><ApplicationName /></span>
          </Link>
        )}

        {!isMobile && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={collapsed ? 'Développer le menu' : 'Réduire le menu'}
            onClick={() => setCollapsed(!collapsed)}
            className="h-8 w-8"
          >
            <ChevronLeft className={cn('h-4 w-4 transition-transform', compact && 'rotate-180')} />
          </Button>
        )}

        {isMobile && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Fermer le menu"
            onClick={() => setMobileOpen(false)}
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        <nav aria-label="Navigation principale" className="space-y-5">
          {navSections.map((section, sectionIndex) => (
            <div key={sectionIndex}>
              {/* Section header */}
              {!compact && section.title && (
                <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.title}
                </h3>
              )}

              {/* Section items */}
              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.href === activeHref;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch={false}
                      onClick={() => isMobile && setMobileOpen(false)}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-primary/10 text-primary ring-1 ring-inset ring-primary/20'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        compact && 'justify-center',
                      )}
                      title={compact ? item.title : undefined}
                      aria-label={item.title}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!compact && <span>{item.title}</span>}
                      {!compact && item.badge && (
                        <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </ScrollArea>

      {/* Footer info utilisateur */}
      {!compact && (
        <div className="border-t p-4">
          <div className="text-xs text-muted-foreground">
            <p className="font-medium">
              Espace{' '}
              {role === 'super-admin'
                ? 'Super administrateur'
                : role === 'parent'
                  ? 'Parent'
                  : role === 'staff'
                    ? 'Personnel'
                    : 'Administrateur'}
            </p>
            <p className="mt-1">{role === 'super-admin' ? 'Administration de la plateforme' : 'Gestion des camps et activités'}</p>
          </div>
        </div>
      )}
    </div>
  );

  // Mobile: overlay sidebar
  if (isMobile) {
    return (
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            aria-label="Ouvrir le menu"
            aria-expanded={mobileOpen}
            className="fixed left-4 top-4 z-40 md:hidden"
          >
            <Menu className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent className="left-0 top-0 h-dvh max-h-dvh w-72 translate-x-0 translate-y-0 rounded-none p-0 gap-0 [&>button]:hidden">
          <DialogTitle className="sr-only">Navigation principale</DialogTitle>
          <DialogDescription className="sr-only">
            Accéder aux rubriques de votre espace
          </DialogDescription>
          <NavContent />
        </DialogContent>
      </Dialog>
    );
  }

  // Desktop: sidebar fixe
  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-dvh shrink-0 md:flex flex-col border-r bg-card transition-[width]',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      <NavContent />
    </aside>
  );
}
