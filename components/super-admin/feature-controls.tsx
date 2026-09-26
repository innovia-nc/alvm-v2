'use client';
import { trpc } from '@/lib/trpc/client';
import { FEATURES } from '@/lib/features/catalog';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';

export function FeatureControls() {
  const utils = trpc.useUtils();
  const state = trpc.features.get.useQuery();
  const update = trpc.features.set.useMutation({
    onSuccess: async () => {
      await utils.features.get.invalidate();
      toast.success('Disponibilité mise à jour');
    },
    onError: (error) => toast.error(error.message),
  });
  if (state.isError)
    return (
      <p role="alert">
        Impossible de charger les fonctionnalités.{' '}
        <Button onClick={() => state.refetch()}>Réessayer</Button>
      </p>
    );
  if (!state.data) return <p>Chargement des fonctionnalités…</p>;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Les changements s’appliquent à tous les rôles métier. Votre accès super admin reste
        disponible. Les données sont conservées ; les opérations automatiques nécessaires aux
        écritures existantes restent cohérentes.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {Object.entries(FEATURES).map(([key, feature]) => {
          const featureKey = key as keyof typeof FEATURES;
          const enabled = state.data[featureKey];
          return (
            <Card key={key}>
              <CardHeader>
                <CardTitle>{feature.label}</CardTitle>
                <CardDescription>{feature.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-4">
                <span className="text-sm">
                  {enabled ? 'Activé' : 'Désactivé'}
                  {key !== 'application' && !state.data.application
                    ? ' · Application suspendue'
                    : ''}
                </span>
                <Button
                  role="switch"
                  aria-checked={enabled}
                  aria-label={feature.label}
                  variant={enabled ? 'outline' : 'default'}
                  disabled={update.isPending}
                  onClick={() => update.mutate({ key: featureKey, enabled: !enabled })}
                >
                  {enabled ? 'Désactiver' : 'Activer'}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
