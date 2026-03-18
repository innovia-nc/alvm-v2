'use client';

/**
 * Edit User Page
 *
 * Page d'édition d'un utilisateur existant.
 * Note: email et role ne peuvent pas être modifiés après création.
 */

import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { UserForm, type UserFormValues } from '@/components/admin/users/user-form';
import { trpc } from '@/lib/trpc/client';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { use } from 'react';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default function EditUserPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const utils = trpc.useUtils();

  // Fetch user data
  const { data: user, isLoading } = trpc.users.getById.useQuery({ id });

  // Update mutation
  const updateMutation = trpc.users.update.useMutation({
    onSuccess: () => {
      utils.users.list.invalidate();
      utils.users.getById.invalidate({ id });
      alert('Utilisateur modifié avec succès');

      // Rediriger vers la liste appropriée selon le rôle
      if (user?.role === 'STAFF') {
        router.push('/dashboard/admin/users/staff');
      } else if (user?.role === 'PARENT') {
        router.push('/dashboard/admin/users/parents');
      } else {
        router.push('/dashboard/admin/users');
      }
    },
    onError: (error) => {
      alert(`Erreur: ${error.message}`);
    },
  });

  const handleSubmit = (data: UserFormValues) => {
    updateMutation.mutate({
      id,
      name: data.name,
      parentProfile: data.parentProfile,
      staffProfile: data.staffProfile
        ? {
            ...data.staffProfile,
            // Ensure phone is undefined, not null
            phone: data.staffProfile.phone ?? undefined,
          }
        : undefined,
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-4 text-muted-foreground">Chargement...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <p className="text-destructive">Utilisateur non trouvé</p>
      </div>
    );
  }

  // Prepare default values for the form
  const defaultValues: Partial<UserFormValues> = {
    email: user.email,
    name: user.name || undefined,
    role: user.role,
    parentProfile: user.parentProfile
      ? {
          firstName: user.parentProfile.firstName,
          lastName: user.parentProfile.lastName,
          phone: user.parentProfile.phone,
          email: user.parentProfile.email || undefined,
          address: user.parentProfile.address || undefined,
          city: user.parentProfile.city || undefined,
          postalCode: user.parentProfile.postalCode || undefined,
        }
      : undefined,
    staffProfile: user.staffProfile
      ? {
          firstName: user.staffProfile.firstName || undefined,
          lastName: user.staffProfile.lastName || undefined,
          phone: user.staffProfile.phone || undefined,
          email: user.staffProfile.email || undefined,
        }
      : undefined,
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Modifier l'utilisateur"
        description={`Modification du compte de ${user.email}`}
      />

      <Card>
        <CardContent className="pt-6">
          <UserForm
            mode="edit"
            defaultValues={defaultValues}
            onSubmit={handleSubmit}
            isSubmitting={updateMutation.isPending}
          />
        </CardContent>
      </Card>
    </div>
  );
}
