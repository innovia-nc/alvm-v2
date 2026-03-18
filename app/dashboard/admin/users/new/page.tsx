'use client';

/**
 * New User Page
 *
 * Page de création d'un nouvel utilisateur (PARENT, STAFF ou ADMIN).
 */

import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { UserForm, type UserFormValues } from '@/components/admin/users/user-form';
import { trpc } from '@/lib/trpc/client';
import { useRouter } from 'next/navigation';

export default function NewUserPage() {
  const router = useRouter();
  const utils = trpc.useUtils();

  const createMutation = trpc.users.create.useMutation({
    onSuccess: () => {
      utils.users.list.invalidate();
      alert('Utilisateur créé avec succès');
      router.push('/dashboard/admin/users');
    },
    onError: (error) => {
      alert(`Erreur: ${error.message}`);
    },
  });

  const handleSubmit = (data: UserFormValues) => {
    // Password is required for creation
    if (!data.password) {
      alert('Le mot de passe est requis pour créer un utilisateur');
      return;
    }

    createMutation.mutate({
      email: data.email,
      name: data.name,
      role: data.role,
      password: data.password,
      parentProfile: data.parentProfile
        ? {
            firstName: data.parentProfile.firstName || '',
            lastName: data.parentProfile.lastName || '',
            phone: data.parentProfile.phone || '',
            address: data.parentProfile.address,
            city: data.parentProfile.city,
            postalCode: data.parentProfile.postalCode,
          }
        : undefined,
      staffProfile: data.staffProfile
        ? {
            firstName: data.staffProfile.firstName || '',
            lastName: data.staffProfile.lastName || '',
            phone: data.staffProfile.phone,
          }
        : undefined,
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Nouvel Utilisateur"
        description="Créer un nouveau compte utilisateur (Parent, Personnel ou Admin)"
      />

      <Card>
        <CardContent className="pt-6">
          <UserForm
            mode="create"
            onSubmit={handleSubmit}
            isSubmitting={createMutation.isPending}
          />
        </CardContent>
      </Card>
    </div>
  );
}
