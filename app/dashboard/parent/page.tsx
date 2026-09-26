import { DashboardSummary } from '@/components/shared/dashboard-summary';
import { PageHeader } from '@/components/shared/page-header';
import { requireAuth } from '@/lib/auth';
import { CalendarDays, ChevronRight, FileText, Users } from 'lucide-react';
import Link from 'next/link';

export default async function ParentDashboardPage() {
  await requireAuth();
  const actions = [
    {
      href: '/dashboard/parent/children',
      title: 'Mes enfants',
      description: 'Ajouter un enfant ou mettre à jour sa fiche',
      icon: Users,
    },
    {
      href: '/dashboard/parent/camps',
      title: 'Inscrire à un camp',
      description: 'Comparer les dates et les tarifs',
      icon: CalendarDays,
    },
    {
      href: '/dashboard/parent/registrations',
      title: 'Mes inscriptions',
      description: 'Retrouver les confirmations et demandes',
      icon: FileText,
    },
  ];
  return (
    <div className="space-y-8">
      <PageHeader
        title="Mon espace parent"
        description="Les activités de vos enfants et vos démarches, au même endroit."
      />
      <section aria-label="Vos démarches" className="grid gap-3 lg:grid-cols-3">
        {actions.map(({ href, title, description, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-center gap-4 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-primary/50 hover:bg-accent/30"
          >
            <span className="rounded-lg bg-primary/10 p-3 text-primary">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{title}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{description}</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        ))}
      </section>
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">À suivre</h2>
        <DashboardSummary role="parent" />
      </div>
    </div>
  );
}
