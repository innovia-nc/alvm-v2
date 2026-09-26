'use client';

import { BackButton } from '@/components/shared/back-button';
import { FormActions } from '@/components/shared/form-actions';
import { PageHeader } from '@/components/shared/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingButton } from '@/components/ui/loading-button';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { trpc } from '@/lib/trpc/client';
import { useRouter } from 'next/navigation';
export function AdultParticipantForm({ role }: { role: 'parent' | 'staff' | 'admin' }) {
  const router = useRouter();
  const create = trpc.children.createAdult.useMutation({
    onSuccess: (result) => {
      router.push(`/dashboard/${role}/children/${result.id}`);
      router.refresh();
    },
  });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Participant adulte autonome"
        actions={<BackButton href={`/dashboard/${role}/children`} />}
        description="Créez la fiche du participant et ses coordonnées de contact."
      />
      <Alert className="max-w-2xl">
        <AlertDescription>
          Le participant est son propre client payeur. Aucun responsable légal n’est créé. Un compte
          sans mot de passe peut être activé depuis « Mot de passe oublié » ou par le secrétariat.
        </AlertDescription>
      </Alert>
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Informations du participant</CardTitle>
          <CardDescription>Tous les champs sont obligatoires.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-6"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              create.mutate({
                firstName: String(f.get('firstName')),
                lastName: String(f.get('lastName')),
                email: String(f.get('email')),
                phone: String(f.get('phone')),
                birthDate: new Date(String(f.get('birthDate'))).toISOString(),
                gender: 'OTHER',
              });
            }}
          >
            <label className="block space-y-2 text-sm font-medium">
              Prénom
              <Input name="firstName" required minLength={2} />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              Nom
              <Input name="lastName" required minLength={2} />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              Email du participant
              <Input name="email" type="email" required />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              Téléphone
              <Input name="phone" type="tel" required minLength={6} />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              Date de naissance
              <Input name="birthDate" type="date" required />
            </label>
            {create.error && (
              <Alert variant="destructive">
                <AlertDescription>{create.error.message}</AlertDescription>
              </Alert>
            )}
            <FormActions>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push(`/dashboard/${role}/children`)}
                disabled={create.isPending}
              >
                Annuler
              </Button>
              <LoadingButton type="submit" loading={create.isPending} loadingText="Création…">
                Créer le participant
              </LoadingButton>
            </FormActions>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
