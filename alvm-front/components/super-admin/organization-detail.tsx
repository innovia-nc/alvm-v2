'use client';
import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
import { FeatureControls } from '@/components/super-admin/feature-controls';
import { AccountsPanel } from '@/components/platform/accounts-panel';
import { formatDate } from '@/lib/utils';
import { toast } from 'sonner';

/** Détail d'une association : identité, disponibilité, modules et comptes. */
export function OrganizationDetail({ id }: { id: string }) {
  const utils = trpc.useUtils();
  const query = trpc.organizations.get.useQuery({ id });
  const [name, setName] = useState<string | null>(null);
  const refresh = async () => {
    await Promise.all([
      utils.organizations.get.invalidate({ id }),
      utils.organizations.list.invalidate(),
    ]);
  };
  const rename = trpc.organizations.rename.useMutation({
    onSuccess: async () => {
      setName(null);
      await refresh();
      toast.success('Nom mis à jour');
    },
    onError: (error) => toast.error(error.message),
  });
  const setStatus = trpc.organizations.setStatus.useMutation({
    onSuccess: async (organization) => {
      await refresh();
      toast.success(
        organization.status === 'SUSPENDED'
          ? 'Association suspendue : connexions refusées'
          : 'Association réactivée',
      );
    },
    onError: (error) => toast.error(error.message),
  });

  if (query.isError)
    return (
      <p role="alert">
        {query.error.message} <Button onClick={() => query.refetch()}>Réessayer</Button>
      </p>
    );
  if (!query.data) return <p>Chargement…</p>;
  const organization = query.data;
  const suspended = organization.status === 'SUSPENDED';

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-3">
            {organization.name}
            <StatusBadge type="organization" status={organization.status} />
          </CardTitle>
          <CardDescription>
            Identifiant de connexion : <span className="font-mono">{organization.slug}</span> ·
            créée le {formatDate(organization.createdAt)} · {organization.accountCount} comptes
            {suspended && organization.suspendedAt
              ? ` · suspendue le ${formatDate(organization.suspendedAt)}`
              : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (name) rename.mutate({ id, name });
            }}
          >
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="organization-name">Nom affiché</Label>
              <Input
                id="organization-name"
                minLength={2}
                maxLength={120}
                value={name ?? organization.name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <Button
              type="submit"
              disabled={!name || name === organization.name || rename.isPending}
            >
              Renommer
            </Button>
          </form>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant={suspended ? 'default' : 'destructive'}
              disabled={setStatus.isPending}
              onClick={() => {
                if (
                  suspended ||
                  window.confirm(
                    `Suspendre « ${organization.name} » ? Plus aucun compte de l’association ne pourra se connecter ; les données sont conservées.`,
                  )
                )
                  setStatus.mutate({ id, status: suspended ? 'ACTIVE' : 'SUSPENDED' });
              }}
            >
              {suspended ? 'Réactiver l’association' : 'Suspendre l’association'}
            </Button>
            <p className="text-sm text-muted-foreground">
              La suspension révoque les sessions à la requête suivante, sans supprimer de données.
            </p>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3" aria-labelledby="organization-modules">
        <h2 id="organization-modules" className="text-lg font-semibold">
          Modules
        </h2>
        <FeatureControls organizationId={id} />
      </section>

      <section className="space-y-3" aria-labelledby="organization-accounts">
        <h2 id="organization-accounts" className="text-lg font-semibold">
          Comptes de l’association
        </h2>
        <AccountsPanel organizationId={id} />
      </section>
    </div>
  );
}
