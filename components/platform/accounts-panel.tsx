'use client';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
const roles: Record<string, string> = {
  ADMIN: 'Admin entreprise',
  SUPER_ADMIN: 'Super admin',
  STAFF: 'Personnel',
  PARENT: 'Parent',
};
export function AccountsPanel() {
  const { data: session } = useSession();
  const utils = trpc.useUtils();
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<{
    id: string;
    name: string;
    email: string;
    disabled: boolean;
    role: string;
  } | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'SUPER_ADMIN' as const,
  });
  const query = trpc.platform.accounts.useQuery({ search, offset, limit: 20 });
  const update = trpc.platform.updateAccount.useMutation({
    onSuccess: async () => {
      setEditing(null);
      await utils.platform.accounts.invalidate();
      toast.success('Compte mis à jour ; anciennes sessions révoquées');
    },
    onError: (e) => toast.error(e.message),
  });
  const create = trpc.platform.createAccount.useMutation({
    onSuccess: async () => {
      setCreating(false);
      setForm({ name: '', email: '', password: '', role: 'SUPER_ADMIN' });
      await utils.platform.accounts.invalidate();
      toast.success('Compte créé');
    },
    onError: (e) => toast.error(e.message),
  });
  const revoke = trpc.platform.revokeSessions.useMutation({
    onSuccess: () => toast.success('Sessions révoquées'),
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Gestion des identités et des accès uniquement. Les emails et mots de passe des comptes
        métier restent gérés par l’entreprise. Les fiches clients, enfants, personnel et les données
        financières restent dans l’espace de l’entreprise.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <Label htmlFor="account-search">Rechercher un compte</Label>
          <Input
            id="account-search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
            placeholder="Nom ou email"
          />
        </div>
        <Button onClick={() => setCreating(!creating)}>
          {creating ? 'Fermer' : 'Créer un super admin'}
        </Button>
      </div>
      {creating && (
        <Card>
          <CardHeader>
            <CardTitle>Nouveau super admin</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                create.mutate(form);
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="new-name">Nom</Label>
                <Input
                  id="new-name"
                  required
                  minLength={2}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-email">Email</Label>
                <Input
                  id="new-email"
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">Mot de passe initial</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={128}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
                <p className="text-sm text-muted-foreground">
                  12 caractères minimum, une majuscule, une minuscule et un chiffre. Ce mot de passe
                  ne sera pas réaffiché.
                </p>
              </div>
              <Button type="submit" disabled={create.isPending}>
                Créer le compte
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
      {editing && (
        <Card>
          <CardHeader>
            <CardTitle>Modifier les accès</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                update.mutate(editing);
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="edit-name">Nom</Label>
                <Input
                  id="edit-name"
                  required
                  minLength={2}
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  readOnly={editing.role !== 'SUPER_ADMIN'}
                  required
                  type="email"
                  value={editing.email}
                  onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                />
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editing.disabled}
                  onChange={(e) => setEditing({ ...editing, disabled: e.target.checked })}
                />
                Compte désactivé
              </label>
              <div className="flex gap-2">
                <Button type="submit" disabled={update.isPending}>
                  Enregistrer les accès
                </Button>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  Annuler
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
      {query.isError ? (
        <p role="alert">
          Comptes indisponibles. <Button onClick={() => query.refetch()}>Réessayer</Button>
        </p>
      ) : !query.data ? (
        <p>Chargement…</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="p-3">Nom</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Rôle</th>
                  <th className="p-3">État</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {query.data.accounts.map((account) => (
                  <tr key={account.id} className="border-t">
                    <td className="p-3">{account.name ?? '—'}</td>
                    <td className="break-all p-3">{account.email}</td>
                    <td className="p-3">{roles[account.role]}</td>
                    <td className="p-3">{account.disabledAt ? 'Désactivé' : 'Actif'}</td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          disabled={account.id === session?.user.id}
                          onClick={() =>
                            setEditing({
                              id: account.id,
                              role: account.role,
                              name: account.name ?? '',
                              email: account.email,
                              disabled: Boolean(account.disabledAt),
                            })
                          }
                        >
                          Modifier
                        </Button>
                        <Button
                          variant="outline"
                          disabled={revoke.isPending || account.id === session?.user.id}
                          onClick={() => revoke.mutate({ id: account.id })}
                        >
                          Révoquer les sessions
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!query.data.accounts.length && <p>Aucun compte trouvé.</p>}
          <div className="flex items-center justify-between gap-3">
            <Button variant="outline" disabled={!offset} onClick={() => setOffset(offset - 20)}>
              Précédent
            </Button>
            <span className="text-sm">{query.data.total} comptes</span>
            <Button
              variant="outline"
              disabled={offset + 20 >= query.data.total}
              onClick={() => setOffset(offset + 20)}
            >
              Suivant
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
