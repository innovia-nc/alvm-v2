'use client';
import { trpc } from '@/lib/trpc/client';
import { signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
      <p role="alert">
        Chargement impossible. <Button onClick={() => query.refetch()}>Réessayer</Button>
      </p>
    );
  if (!query.data) return <p>Chargement…</p>;
  return (
    <div className="mx-auto max-w-lg space-y-6 p-6">
      <h1 className="text-2xl font-bold">Mon compte</h1>
      <form
        className="space-y-4"
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
        <label className="block">
          Nom
          <Input name="name" defaultValue={query.data.name ?? ''} required minLength={2} />
        </label>
        <label className="block">
          Email
          <Input name="email" type="email" defaultValue={query.data.email} required />
        </label>
        <label className="block">
          Mot de passe actuel
          <Input name="current" type="password" autoComplete="current-password" required />
        </label>
        <label className="block">
          Nouveau mot de passe (facultatif)
          <Input name="password" type="password" autoComplete="new-password" minLength={8} />
        </label>
        <p className="text-sm">
          Au moins 8 caractères, une majuscule, une minuscule et un chiffre. Enregistrer déconnecte
          vos sessions.
        </p>
        <Button disabled={update.isPending}>Enregistrer</Button>
      </form>
    </div>
  );
}
