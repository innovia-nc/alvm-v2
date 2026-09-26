'use client';
import { ApplicationName } from '@/components/providers/branding-provider';
import { trpc } from '@/lib/trpc/client';

/**
 * Espace affiché dans l'en-tête : l'association de la session, ou le nom de
 * l'application pour la super administration (et pendant le chargement).
 */
export function OrganizationName({ enabled }: { enabled: boolean }) {
  const organization = trpc.organizations.current.useQuery(undefined, {
    enabled,
    staleTime: 5 * 60_000,
  });
  if (enabled && organization.data?.kind === 'TENANT') return <>{organization.data.name}</>;
  return <ApplicationName />;
}
