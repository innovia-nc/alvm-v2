'use client';
import { usePathname } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { featuresForPage } from '@alvm/shared/features';
import { Button } from '@/components/ui/button';

export function FeatureBoundary({ children, role }: { children: React.ReactNode; role?: string }) {
  const pathname = usePathname();
  const exempt = role === 'SUPER_ADMIN' || pathname === '/dashboard/account';
  const state = trpc.features.get.useQuery(undefined, {
    enabled: !exempt,
    refetchInterval: 15000,
    staleTime: 0,
  });
  if (exempt) return children;
  if (state.isError)
    return (
      <p role="alert">
        Impossible de vérifier la disponibilité.{' '}
        <Button onClick={() => state.refetch()}>Réessayer</Button>
      </p>
    );
  if (!state.data) return <p>Chargement de votre espace…</p>;
  if (featuresForPage(pathname).some((key) => !state.data[key]))
    return (
      <div role="status" className="rounded-xl border bg-card p-8">
        <h1 className="text-xl font-semibold">Fonctionnalité indisponible</h1>
        <p className="mt-2 text-muted-foreground">
          Cet accès a été désactivé par le super administrateur. Vos données sont conservées.
        </p>
      </div>
    );
  return children;
}
