'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { DEFAULT_BRANDING } from '@alvm/shared/platform';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RequiredMark } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';

export function ConfigurationForm() {
  const query = trpc.platform.configuration.useQuery();
  const utils = trpc.useUtils();
  const router = useRouter();
  const [form, setForm] = useState(DEFAULT_BRANDING);
  useEffect(() => {
    if (query.data) setForm(query.data.branding);
  }, [query.data]);
  const save = trpc.platform.saveBranding.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.platform.branding.invalidate(),
        utils.platform.configuration.invalidate(),
      ]);
      router.refresh();
      toast.success('Identité de l’application enregistrée');
    },
    onError: (e) => toast.error(e.message),
  });
  if (query.isError)
    return (
      <p role="alert">
        Impossible de charger la configuration.{' '}
        <Button onClick={() => query.refetch()}>Réessayer</Button>
      </p>
    );
  if (!query.data) return <p>Chargement…</p>;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Identité de l’application</CardTitle>
          <CardDescription>
            Ces informations s’affichent dans les espaces de connexion et la navigation. L’identité
            de l’entreprise sur les factures reste gérée par son admin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(form);
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="application-name">Nom de l’application<RequiredMark /></Label>
              <Input
                id="application-name"
                required
                minLength={2}
                maxLength={80}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="application-description">Description</Label>
              <Input
                id="application-description"
                maxLength={200}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="support-email">Email du support</Label>
              <Input
                id="support-email"
                type="email"
                value={form.supportEmail}
                onChange={(e) => setForm({ ...form, supportEmail: e.target.value })}
              />
              <p className="text-sm text-muted-foreground">
                Affiché comme lien de contact sur les écrans de connexion et d’erreur.
              </p>
            </div>
            <Button disabled={save.isPending} type="submit">
              {save.isPending ? 'Enregistrement…' : 'Enregistrer l’identité'}
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Infrastructure</CardTitle>
          <CardDescription>
            Ces paramètres assurent le démarrage du serveur et restent configurés dans
            l’environnement de déploiement.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            Base de données : {query.data.infrastructure.database ? 'configurée' : 'non configurée'}
          </p>
          <p>
            Authentification :{' '}
            {query.data.infrastructure.authentication ? 'configurée' : 'non configurée'}
          </p>
          <p>
            Chiffrement des clés API :{' '}
            {query.data.encryptionReady ? 'prêt' : 'à configurer sur le serveur'}
          </p>
          <p className="break-all">
            Adresse de l’application : {query.data.infrastructure.publicUrl ?? 'non définie'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
