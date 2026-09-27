'use client';
import { useState } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';

const EMPTY_FORM = { name: '', slug: '', adminName: '', adminEmail: '', adminPassword: '' };

/** Propose un identifiant d'espace depuis le nom (sans accents, tirets). */
function slugFromName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * Associations de la plateforme : recherche, création (espace + premier
 * administrateur), accès au détail. Le détail règle modules, statut et comptes.
 */
export function OrganizationsPanel() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [creating, setCreating] = useState(false);
  const [slugEdited, setSlugEdited] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const query = trpc.organizations.list.useQuery({ search, offset, limit: 20 });
  const create = trpc.organizations.create.useMutation({
    onSuccess: async (organization) => {
      setCreating(false);
      setForm(EMPTY_FORM);
      setSlugEdited(false);
      await utils.organizations.list.invalidate();
      toast.success(`Association « ${organization.name} » créée`);
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <Label htmlFor="organization-search">Rechercher une association</Label>
          <Input
            id="organization-search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setOffset(0);
            }}
            placeholder="Nom ou identifiant"
          />
        </div>
        <Button onClick={() => setCreating(!creating)}>
          {creating ? 'Fermer' : 'Créer une association'}
        </Button>
      </div>

      {creating && (
        <Card>
          <CardHeader>
            <CardTitle>Nouvelle association</CardTitle>
            <CardDescription>
              L’espace est créé avec ses moyens de paiement et sa tarification par défaut (TGC à 0
              %, ajustable par l’association). Le premier administrateur reçoit l’identifiant de
              l’espace et son mot de passe initial par vos soins.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4 md:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                create.mutate({
                  name: form.name,
                  slug: form.slug,
                  admin: {
                    name: form.adminName,
                    email: form.adminEmail,
                    password: form.adminPassword,
                  },
                });
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="organization-name">Nom de l’association</Label>
                <Input
                  id="organization-name"
                  required
                  minLength={2}
                  maxLength={120}
                  value={form.name}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      name: event.target.value,
                      slug: slugEdited ? form.slug : slugFromName(event.target.value),
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="organization-slug">Identifiant de l’espace</Label>
                <Input
                  id="organization-slug"
                  required
                  pattern="[a-z0-9](?:[a-z0-9\-]{1,38}[a-z0-9])"
                  title="3 à 40 caractères : minuscules, chiffres et tirets"
                  value={form.slug}
                  onChange={(event) => {
                    setSlugEdited(true);
                    setForm({ ...form, slug: event.target.value.toLowerCase() });
                  }}
                />
                <p className="text-sm text-muted-foreground">
                  Saisi à la connexion. Définitif : communiquez-le aux utilisateurs.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="organization-admin-name">Administrateur — nom</Label>
                <Input
                  id="organization-admin-name"
                  required
                  minLength={2}
                  value={form.adminName}
                  onChange={(event) => setForm({ ...form, adminName: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="organization-admin-email">Administrateur — email</Label>
                <Input
                  id="organization-admin-email"
                  type="email"
                  required
                  value={form.adminEmail}
                  onChange={(event) => setForm({ ...form, adminEmail: event.target.value })}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="organization-admin-password">Mot de passe initial</Label>
                <Input
                  id="organization-admin-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={128}
                  value={form.adminPassword}
                  onChange={(event) => setForm({ ...form, adminPassword: event.target.value })}
                />
                <p className="text-sm text-muted-foreground">
                  12 caractères minimum, une majuscule, une minuscule et un chiffre. Il ne sera pas
                  réaffiché.
                </p>
              </div>
              <div className="md:col-span-2">
                <Button type="submit" disabled={create.isPending}>
                  Créer l’association
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {query.isError ? (
        <p role="alert">
          Associations indisponibles. <Button onClick={() => query.refetch()}>Réessayer</Button>
        </p>
      ) : !query.data ? (
        <p>Chargement…</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="p-3">Association</th>
                  <th className="p-3">Identifiant</th>
                  <th className="p-3">État</th>
                  <th className="p-3">Comptes</th>
                  <th className="p-3">Créée le</th>
                </tr>
              </thead>
              <tbody>
                {query.data.organizations.map((organization) => (
                  <tr key={organization.id} className="border-t">
                    <td className="p-3">
                      <Link
                        className="font-medium text-primary hover:underline"
                        href={`/dashboard/super-admin/organizations/${organization.id}`}
                      >
                        {organization.name}
                      </Link>
                    </td>
                    <td className="p-3 font-mono">{organization.slug}</td>
                    <td className="p-3">
                      <StatusBadge type="organization" status={organization.status} />
                    </td>
                    <td className="p-3">{organization.accountCount}</td>
                    <td className="p-3">{formatDate(organization.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!query.data.organizations.length && <p>Aucune association trouvée.</p>}
          <div className="flex items-center justify-between gap-3">
            <Button variant="outline" disabled={!offset} onClick={() => setOffset(offset - 20)}>
              Précédent
            </Button>
            <span className="text-sm">{query.data.total} associations</span>
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
