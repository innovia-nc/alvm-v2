'use client';

import Link from 'next/link';
import {
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  Clock3,
  Receipt,
  AlertCircle,
} from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export function DashboardSummary({ role }: { role: 'admin' | 'staff' | 'parent' }) {
  const query = trpc.dashboard.summary.useQuery();
  if (query.isError)
    return (
      <div role="alert" className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-6">
        <AlertCircle className="h-5 w-5 text-destructive" aria-hidden="true" />
        <p className="flex-1">La synthèse est indisponible pour le moment.</p>
        <Button variant="outline" onClick={() => query.refetch()}>
          Réessayer
        </Button>
      </div>
    );
  if (!query.data)
    return (
      <div role="status" className="grid gap-4 sm:grid-cols-3">
        <span className="sr-only">Chargement des priorités…</span>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-40 rounded-xl" />
        ))}
      </div>
    );
  const d = query.data;
  const base = `/dashboard/${role}`;
  const priorities = [
    {
      label: d.pending === 1 ? 'Inscription en attente' : 'Inscriptions en attente',
      value: d.pending.toLocaleString('fr-FR'),
      href: `${base}/registrations?status=PENDING`,
      icon: Clock3,
      hint: role === 'parent' ? 'Suivre mes inscriptions' : 'Consulter les inscriptions',
    },
    {
      label: role === 'parent' ? 'Montant à régler' : 'Montant restant à encaisser',
      value: d.amountDue.toLocaleString('fr-FR'),
      unit: 'XPF',
      href: `${base}/invoices`,
      icon: Receipt,
      hint: 'Consulter les factures',
    },
    {
      label: d.overdue === 1 ? 'Facture en retard' : 'Factures en retard',
      value: d.overdue.toLocaleString('fr-FR'),
      href: `${base}/invoices?status=OVERDUE`,
      icon: AlertCircle,
      hint: d.overdue ? 'Voir les échéances dépassées' : 'Aucune échéance dépassée',
    },
  ];
  return (
    <section className="space-y-6" aria-label="Priorités">
      <div className="grid gap-4 sm:grid-cols-3">
        {priorities.map(({ label, value, unit, href, icon: Icon, hint }) => (
          <Link
            key={href}
            href={href}
            className="group flex flex-col rounded-xl border bg-card p-5 shadow-sm transition-colors hover:border-primary/50 hover:bg-accent/30"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="text-sm font-medium text-muted-foreground">{label}</span>
              <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            </div>
            <p className="my-3 text-3xl font-semibold tracking-tight tabular-nums">
              {value}{' '}
              {unit && <span className="text-sm font-medium text-muted-foreground">{unit}</span>}
            </p>
            <span className="mt-auto flex items-center justify-between gap-2 text-xs text-muted-foreground group-hover:text-primary">
              {hint}
              <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" />
            </span>
          </Link>
        ))}
      </div>
      {d.cancellationRequests.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
          <div className="flex items-center gap-3 px-5 py-4">
            <Clock3
              className="h-5 w-5 shrink-0 text-amber-800 dark:text-amber-200"
              aria-hidden="true"
            />
            <h2 className="font-semibold">
              {role === 'parent'
                ? 'Vos demandes d’annulation en cours'
                : 'Demandes d’annulation à traiter'}
            </h2>
            <span className="ml-auto text-sm font-semibold tabular-nums">
              {d.cancellationRequests.length}
            </span>
          </div>
          <ul className="divide-y divide-amber-200 dark:divide-amber-900">
            {d.cancellationRequests.map((r) => (
              <li key={r.id}>
                <Link
                  className="flex items-center justify-between gap-4 px-5 py-3 text-sm hover:bg-amber-100/60 dark:hover:bg-amber-900/30"
                  href={`${base}/registrations/${r.id}`}
                >
                  <span>
                    <span className="font-medium">
                      {r.child.firstName} {r.child.lastName}
                    </span>
                    <span className="mt-1 block text-muted-foreground">{r.camp.name}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <h2 className="font-semibold">Prochaines activités</h2>
          <Link className="text-sm font-medium text-primary hover:underline" href={`${base}/camps`}>
            Voir les camps <span aria-hidden="true">→</span>
          </Link>
        </div>
        {d.upcoming.length ? (
          <ul className="divide-y">
            {d.upcoming.map((c) => (
              <li key={c.id}>
                <Link
                  className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/60"
                  href={`${base}/camps/${c.id}`}
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <CalendarDays className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-medium">{c.name}</span>
                    <time
                      dateTime={c.startDate.toISOString()}
                      className="mt-1 block text-sm text-muted-foreground"
                    >
                      {c.startDate.toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                        timeZone: 'Pacific/Noumea',
                      })}
                    </time>
                  </span>
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-5 py-10 text-center">
            <CalendarDays
              className="mx-auto mb-3 h-8 w-8 text-muted-foreground"
              aria-hidden="true"
            />
            <p className="font-medium">Aucune activité à venir</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {role === 'parent'
                ? 'Découvrez les camps disponibles pour préparer votre prochaine inscription.'
                : 'Les prochains camps publiés apparaîtront ici.'}
            </p>
            <Button asChild variant="outline" className="mt-4">
              <Link href={`${base}/camps`}>Consulter les camps</Link>
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
