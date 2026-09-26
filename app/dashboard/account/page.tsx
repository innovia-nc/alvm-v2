'use client';

import { FormActions } from '@/components/shared/form-actions';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingButton } from '@/components/ui/loading-button';

import { ErrorState } from '@/components/shared/error-state';
import { LoadingState } from '@/components/shared/loading-state';
import { Input } from '@/components/ui/input';
import { trpc } from '@/lib/trpc/client';
import { signOut } from 'next-auth/react';
import { toast } from 'sonner';
export default function AccountPage() {
  const query = trpc.account.me.useQuery();
  const update = trpc.account.update.useMutation({
    onSuccess: () => {
      toast.success('Compte modifié. Reconnectez-vous.');
      void signOut({ callbackUrl: '/auth/signin' });
    },
    onError: (e) => toast.error(e.message),
  });
  if (query.isError)
    return (
      <ErrorState message="Impossible de charger votre compte." onRetry={() => query.refetch()} />
    );
  if (!query.data) return <LoadingState label="Chargement du compte…" />;
  return (
    <div className="space-y-6">
      <PageHeader title="Mon compte" description="Gérez vos coordonnées et votre mot de passe." />
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Informations de connexion</CardTitle>
          <CardDescription>
            Votre mot de passe actuel est nécessaire pour enregistrer une modification.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-6"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              update.mutate({
                name: String(f.get('name')),
                email: String(f.get('email')),
                currentPassword: String(f.get('current')),
                newPassword: String(f.get('password')) || undefined,
              });
            }}
          >
            <label className="block space-y-2 text-sm font-medium">
              Nom
              <Input name="name" defaultValue={query.data.name ?? ''} required minLength={2} />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              Email
              <Input name="email" type="email" defaultValue={query.data.email} required />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              Mot de passe actuel
              <Input name="current" type="password" autoComplete="current-password" required />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              Nouveau mot de passe (facultatif)
              <Input name="password" type="password" autoComplete="new-password" minLength={8} />
            </label>
            <p className="text-sm text-muted-foreground">
              Au moins 8 caractères, une majuscule, une minuscule et un chiffre. Enregistrer
              déconnecte vos sessions.
            </p>
            <FormActions>
              <LoadingButton type="submit" loading={update.isPending} loadingText="Enregistrement…">
                Enregistrer
              </LoadingButton>
            </FormActions>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
