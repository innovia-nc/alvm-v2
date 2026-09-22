'use client';
import { trpc } from '@/lib/trpc/client';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
export function AdultParticipantForm({ role }: { role: 'parent' | 'staff' | 'admin' }) {
  const router = useRouter();
  const create = trpc.children.createAdult.useMutation({
    onSuccess: (result) => {
      router.push(`/dashboard/${role}/children/${result.id}`);
      router.refresh();
    },
  });
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-bold">Participant adulte autonome</h1>
      <p>
        Le participant est son propre client payeur. Aucun responsable légal n’est créé. Un compte
        sans mot de passe peut être activé depuis « Mot de passe oublié » ou par le secrétariat.
      </p>
      <form
        className="space-y-4"
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
        <label className="block">
          Prénom
          <Input name="firstName" required minLength={2} />
        </label>
        <label className="block">
          Nom
          <Input name="lastName" required minLength={2} />
        </label>
        <label className="block">
          Email du participant
          <Input name="email" type="email" required />
        </label>
        <label className="block">
          Téléphone
          <Input name="phone" type="tel" required minLength={6} />
        </label>
        <label className="block">
          Date de naissance
          <Input name="birthDate" type="date" required />
        </label>
        {create.error && <p role="alert">{create.error.message}</p>}
        <Button disabled={create.isPending}>Créer le participant</Button>
      </form>
    </div>
  );
}
