'use client';
import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
export function DashboardSummary({ role }: { role: 'admin' | 'staff' | 'parent' }) {
  const query = trpc.dashboard.summary.useQuery();
  if (query.isError)
    return (
      <div role="alert">
        Synthèse indisponible. <Button onClick={() => query.refetch()}>Réessayer</Button>
      </div>
    );
  if (!query.data) return <p role="status">Chargement des priorités…</p>;
  const d = query.data;
  const base = `/dashboard/${role}`;
  return (
    <section className="space-y-4" aria-label="Priorités">
      <div className="grid gap-4 sm:grid-cols-3">
        <Link className="rounded border p-4" href={`${base}/registrations?status=PENDING`}>
          {d.pending} inscription(s) en attente
        </Link>
        <Link className="rounded border p-4" href={`${base}/invoices`}>
          {d.amountDue.toLocaleString('fr-FR')} XPF à régler
        </Link>
        <Link className="rounded border p-4" href={`${base}/invoices?status=OVERDUE`}>
          {d.overdue} facture(s) en retard
        </Link>
      </div>
      <h2 className="font-semibold">Prochaines activités</h2>
      {d.upcoming.length ? (
        <ul>
          {d.upcoming.map((c) => (
            <li key={c.id}>
              <Link className="underline" href={`${base}/camps/${c.id}`}>
                {c.name} — {c.startDate.toLocaleDateString('fr-FR', { timeZone: 'Pacific/Noumea' })}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p>Aucune activité à venir.</p>
      )}
      {d.cancellationRequests.length > 0 && (
        <div>
          <h2 className="font-semibold">Demandes d’annulation à traiter</h2>
          <ul>
            {d.cancellationRequests.map((r) => (
              <li key={r.id}>
                <Link className="underline" href={`${base}/registrations/${r.id}`}>
                  {r.child.firstName} {r.child.lastName} — {r.camp.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
