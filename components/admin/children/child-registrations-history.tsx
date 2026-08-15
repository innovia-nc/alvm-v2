'use client';

/**
 * ChildRegistrationsHistory — Historique des inscriptions d'un enfant.
 *
 * - Admin/Staff : fetch client via hook tRPC (useQuery).
 * - Parent : si `initialData` fourni (pré-chargé SSR côté page parent),
 *   l'utilise directement sans refetch.
 *
 * Appel figé : registrations.list({ childId, sortBy:'registrationDate',
 *   sortOrder:'desc', limit: 50, offset: 0 })
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
import { trpc } from '@/lib/trpc/client';
import { ClipboardList, FileText } from 'lucide-react';
import type { AppRouter } from '@/server/trpc/router';
import type { inferRouterOutputs } from '@trpc/server';

// ============================================================================
// TYPES
// ============================================================================

type RouterOutput = inferRouterOutputs<AppRouter>;

type RegistrationListItem =
  RouterOutput['registrations']['list']['registrations'][number];

interface ChildRegistrationsHistoryProps {
  childId: string;
  /** SSR parent : données pré-chargées via createCaller côté page. */
  initialData?: { registrations: RegistrationListItem[]; total: number };
}

// ============================================================================
// HELPERS
// ============================================================================

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatAmount(amount: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XPF',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// ============================================================================
// SOUS-COMPOSANT : ligne d'inscription
// ============================================================================

function RegistrationRow({ registration }: { registration: RegistrationListItem }) {
  return (
    <div className="flex flex-col gap-2 py-4 border-b last:border-b-0 sm:flex-row sm:items-center sm:gap-4">
      {/* Camp + dates */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{registration.camp.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {registration.camp.startDate && registration.camp.endDate
            ? `${formatDate(registration.camp.startDate)} – ${formatDate(registration.camp.endDate)}`
            : registration.camp.startDate
              ? `À partir du ${formatDate(registration.camp.startDate)}`
              : 'Dates non définies'}
        </p>
        <p className="text-xs text-muted-foreground">
          Inscrit le {formatDate(registration.registrationDate)}
        </p>
      </div>

      {/* Montant */}
      <div className="text-sm text-right shrink-0">
        <span className="font-medium">{formatAmount(registration.totalAmount)}</span>
      </div>

      {/* Statut inscription */}
      <div className="shrink-0">
        <StatusBadge type="registration" status={registration.status} />
      </div>

      {/* Facture (si disponible) */}
      {registration.invoiceNumber && registration.invoiceStatus && (
        <div className="flex items-center gap-1.5 shrink-0">
          <FileText className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <span className="text-xs text-muted-foreground">{registration.invoiceNumber}</span>
          <StatusBadge type="invoice" status={registration.invoiceStatus} showIcon={false} />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// COMPOSANT PRINCIPAL
// ============================================================================

export function ChildRegistrationsHistory({
  childId,
  initialData,
}: ChildRegistrationsHistoryProps) {
  /**
   * Si initialData est fourni (contexte parent SSR), on l'utilise directement.
   * La propriété `enabled` est false dans ce cas — aucun refetch réseau.
   */
  const query = trpc.registrations.list.useQuery(
    {
      childId,
      sortBy: 'registrationDate',
      sortOrder: 'desc',
      limit: 50,
      offset: 0,
    },
    {
      enabled: !initialData,
      initialData: initialData ?? undefined,
    },
  );

  const registrations = query.data?.registrations ?? [];
  const isLoading = query.isLoading && !initialData;
  const isError = query.isError;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="h-5 w-5" aria-hidden="true" />
          Historique des inscriptions
          {query.data && (
            <span className="ml-auto text-sm font-normal text-muted-foreground">
              {query.data.total} inscription{query.data.total !== 1 ? 's' : ''}
            </span>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent>
        {/* Chargement */}
        {isLoading && (
          <div className="space-y-3" aria-busy="true" aria-label="Chargement des inscriptions">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 rounded-md bg-muted/50 animate-pulse" />
            ))}
          </div>
        )}

        {/* Erreur */}
        {isError && !isLoading && (
          <p className="text-sm text-destructive py-4 text-center" role="alert">
            Impossible de charger l'historique des inscriptions.
          </p>
        )}

        {/* État vide — Scénario 2 */}
        {!isLoading && !isError && registrations.length === 0 && (
          <div className="text-center py-8">
            <ClipboardList
              className="mx-auto h-10 w-10 text-muted-foreground/50"
              aria-hidden="true"
            />
            <p className="mt-2 text-sm text-muted-foreground">Aucune inscription</p>
          </div>
        )}

        {/* Liste triée desc (garantie par le router) */}
        {!isLoading && !isError && registrations.length > 0 && (
          <div role="list" aria-label="Historique des inscriptions">
            {registrations.map((reg) => (
              <div key={reg.id} role="listitem">
                <RegistrationRow registration={reg} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
