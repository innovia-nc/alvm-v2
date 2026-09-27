'use client';
import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
const labels: Record<string, string> = {
  'auth.login': 'Connexion',
  'auth.login_failed': 'Échec de connexion',
  'platform.branding.updated': 'Identité de l’application modifiée',
  'platform.integration.updated': 'Intégration modifiée',
  'platform.integration.checked': 'Connexion à un fournisseur vérifiée',
  'platform.account.created': 'Compte créé',
  'platform.account.updated': 'Accès au compte modifié',
  'platform.account.sessions_revoked': 'Sessions révoquées',
  'platform.feature.enabled': 'Fonctionnalité activée',
  'platform.feature.disabled': 'Fonctionnalité désactivée',
  'account.updated': 'Compte personnel modifié',
  'account.password_reset': 'Mot de passe réinitialisé',
};
export function AuditLog() {
  const [offset, setOffset] = useState(0);
  const [action, setAction] = useState('');
  const query = trpc.platform.audit.useQuery(
    { offset, action, limit: 30 },
    { refetchInterval: 15000 },
  );
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Historique des accès et de l’administration de la plateforme. Les mots de passe, clés API et
        contenus métier ne sont pas enregistrés dans ce journal.
      </p>
      <div className="space-y-2">
        <Label htmlFor="audit-action">Filtrer par code d’action</Label>
        <Input
          id="audit-action"
          placeholder="Ex. platform.feature"
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setOffset(0);
          }}
        />
      </div>
      {query.isError ? (
        <p role="alert">
          Journal indisponible. <Button onClick={() => query.refetch()}>Réessayer</Button>
        </p>
      ) : !query.data ? (
        <p>Chargement…</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="p-3">Date</th>
                  <th className="p-3">Action</th>
                  <th className="p-3">Auteur</th>
                  <th className="p-3">Cible</th>
                  <th className="p-3">Résultat</th>
                </tr>
              </thead>
              <tbody>
                {query.data.events.map((event) => (
                  <tr className="border-t" key={event.id}>
                    <td className="whitespace-nowrap p-3">
                      {new Date(event.createdAt).toLocaleString('fr-FR')}
                    </td>
                    <td className="p-3">{labels[event.action] ?? event.action}</td>
                    <td className="break-all p-3">{event.actorName}</td>
                    <td className="break-all p-3">{event.targetLabel}</td>
                    <td className="p-3">{event.outcome === 'SUCCESS' ? 'Réussi' : 'Échec'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!query.data.events.length && <p>Aucun événement enregistré.</p>}
          <div className="flex items-center justify-between gap-3">
            <Button variant="outline" disabled={!offset} onClick={() => setOffset(offset - 30)}>
              Précédent
            </Button>
            <span className="text-sm">{query.data.total} événements</span>
            <Button
              variant="outline"
              disabled={offset + 30 >= query.data.total}
              onClick={() => setOffset(offset + 30)}
            >
              Suivant
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
