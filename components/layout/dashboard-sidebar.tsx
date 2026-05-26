'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Home,
  Users,
  CalendarDays,
  FileText,
  Receipt,
  Settings,
  Menu,
  X,
  ChevronLeft,
  CreditCard,
  FileCheck,
  Tag,
  RefreshCcw,
} from 'lucide-react';
import { useMediaQuery } from '@/lib/hooks/use-media-query';

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
  role: 'parent' | 'staff' | 'admin';
}

// Configuration navigation par rôle
const navigationConfig: Record<string, NavSection[]> = {
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
          title: 'Parents',
          href: '/dashboard/staff/parents',
          icon: Users,
        },
        {
          title: 'Enfants',
          href: '/dashboard/staff/children',
          icon: Users,
        },
        {
          title: 'Personnel ALVM',
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
          title: 'Parents',
          href: '/dashboard/admin/users/parents',
          icon: Users,
        },
        {
          title: 'Enfants',
          href: '/dashboard/admin/children',
          icon: Users,
        },
        {
          title: 'Personnel ALVM',
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

export function DashboardSidebar({ role }: DashboardSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const isMobile = useMediaQuery('(max-width: 768px)');

  const navSections = navigationConfig[role] || [];

  const NavContent = () => (
    <div className="flex h-full flex-col">
      {/* Logo et toggle collapse */}
      <div className="flex h-16 items-center justify-between border-b px-4">
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="text-xl font-bold text-primary">ALVM</span>
          </Link>
        )}

        {!isMobile && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            className="h-8 w-8"
          >
            <ChevronLeft
              className={cn(
                'h-4 w-4 transition-transform',
                collapsed && 'rotate-180'
              )}
            />
          </Button>
        )}

        {isMobile && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(false)}
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-6">
          {navSections.map((section, sectionIndex) => (
            <div key={sectionIndex}>
              {/* Section header */}
              {!collapsed && section.title && (
                <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.title}
                </h3>
              )}

              {/* Section items */}
              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href || pathname.startsWith(item.href + '/');

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => isMobile && setMobileOpen(false)}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        collapsed && 'justify-center'
                      )}
                      title={collapsed ? item.title : undefined}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                      {!collapsed && item.badge && (
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
      {!collapsed && (
        <div className="border-t p-4">
          <div className="text-xs text-muted-foreground">
            <p className="font-medium">
              Espace {role === 'parent' ? 'Parent' : role === 'staff' ? 'Personnel' : 'Administrateur'}
            </p>
            <p className="mt-1">Version 2.0.0</p>
          </div>
        </div>
      )}
    </div>
  );

  // Mobile: overlay sidebar
  if (isMobile) {
    return (
      <>
        {/* Toggle button mobile */}
        <Button
          variant="outline"
          size="icon"
          onClick={() => setMobileOpen(true)}
          className="fixed left-4 top-4 z-50 md:hidden"
        >
          <Menu className="h-4 w-4" />
        </Button>

        {/* Overlay */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-50 bg-black/50 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* Sidebar mobile */}
        <aside
          className={cn(
            'fixed left-0 top-0 z-50 h-full w-72 bg-card border-r transition-transform md:hidden',
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <NavContent />
        </aside>
      </>
    );
  }

  // Desktop: sidebar fixe
  return (
    <aside
      className={cn(
        'hidden md:flex flex-col h-screen border-r bg-card transition-all',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      <NavContent />
    </aside>
  );
}
