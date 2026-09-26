'use client';
import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { INTEGRATIONS, type IntegrationId } from '@/lib/platform';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';

export function IntegrationsPanel() {
  const query = trpc.platform.integrations.useQuery();
  const utils = trpc.useUtils();
  const [secrets, setSecrets] = useState<Partial<Record<IntegrationId, string>>>({});
  const [checks, setChecks] = useState<Partial<Record<IntegrationId, string>>>({});
  const save = trpc.platform.saveIntegration.useMutation({
    onSuccess: async (_, input) => {
      setSecrets((s) => ({ ...s, [input.id]: '' }));
      setChecks((s) => ({ ...s, [input.id]: '' }));
      await utils.platform.integrations.invalidate();
      toast.success('Intégration mise à jour');
    },
    onError: (e) => toast.error(e.message),
  });
  const check = trpc.platform.checkIntegration.useMutation({
    onSuccess: (data, input) => setChecks((s) => ({ ...s, [input.id]: data.message })),
    onError: (e) => toast.error(e.message),
  });
  if (query.isError)
    return (
      <p role="alert">
        Impossible de charger les intégrations.{' '}
        <Button onClick={() => query.refetch()}>Réessayer</Button>
      </p>
    );
  if (!query.data) return <p>Chargement…</p>;
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Les clés sont chiffrées à l’enregistrement et ne sont jamais réaffichées. Les services
        utilisent les changements dès leur prochain appel.
      </p>
      {query.data.map((item) => (
        <Card key={item.id}>
          <CardHeader>
            <CardTitle>{INTEGRATIONS[item.id].label}</CardTitle>
            <CardDescription>{INTEGRATIONS[item.id].description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm">
              {item.enabled ? 'Activée' : 'Désactivée'} ·{' '}
              {item.source === 'database'
                ? 'Clé enregistrée'
                : item.source === 'environment'
                  ? 'Clé fournie par l’environnement serveur'
                  : 'Aucune clé configurée'}
            </p>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const secret = secrets[item.id]?.trim();
                if (secret) save.mutate({ id: item.id, enabled: true, secret });
              }}
            >
              <Label htmlFor={`secret-${item.id}`}>
                Nouvelle clé API — {INTEGRATIONS[item.id].label}
              </Label>
              <Input
                id={`secret-${item.id}`}
                type="password"
                autoComplete="new-password"
                value={secrets[item.id] ?? ''}
                onChange={(e) => setSecrets((s) => ({ ...s, [item.id]: e.target.value }))}
                placeholder={
                  item.configured ? 'Laisser vide pour conserver la clé' : 'Saisir la clé'
                }
                minLength={8}
                maxLength={4096}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={save.isPending || !secrets[item.id]?.trim()}>
                  Enregistrer et activer
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={save.isPending || (!item.configured && !item.enabled)}
                  onClick={() => save.mutate({ id: item.id, enabled: !item.enabled })}
                >
                  {item.enabled ? 'Désactiver' : 'Activer'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={check.isPending || !item.enabled || !item.configured}
                  onClick={() => check.mutate({ id: item.id })}
                >
                  Vérifier la connexion
                </Button>
                {item.source === 'database' && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={save.isPending}
                    onClick={() => save.mutate({ id: item.id, enabled: false, removeSecret: true })}
                  >
                    Supprimer la clé et désactiver
                  </Button>
                )}
              </div>
            </form>
            {checks[item.id] && (
              <p role="status" className="text-sm">
                {checks[item.id]}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
      <Card>
        <CardHeader>
          <CardTitle>Passerelle de paiement</CardTitle>
          <CardDescription>
            Aucune passerelle de paiement en ligne n’est actuellement connectée.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Le choix du prestataire est nécessaire pour connecter ses clés, sa création de paiement
            et ses notifications de confirmation. Les moyens de règlement gérés par l’entreprise
            servent actuellement à enregistrer les paiements reçus.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
