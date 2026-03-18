'use client';

/**
 * New Camp Page
 *
 * Page de création d'un nouveau camp de vacances.
 * Accessible uniquement aux animateurs et directeurs (animatorProcedure).
 */

import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { CampForm, CampFormValues } from '@/components/admin/camps/camp-form';
import { trpc } from '@/lib/trpc/client';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function NewCampPage() {
  const router = useRouter();
  const utils = trpc.useUtils();

  // Fetch camp types
  const { data: campTypes, isLoading: isLoadingTypes } = trpc.camps.listCampTypes.useQuery();

  // Mutation pour créer le camp
  const createMutation = trpc.camps.create.useMutation({
    onSuccess: (data) => {
      utils.camps.list.invalidate();
      toast.success('Camp créé avec succès', {
        description: `Le camp "${data.name}" a été créé.`,
      });
      router.push('/dashboard/admin/camps');
    },
    onError: (error) => {
      toast.error('Erreur lors de la création', {
        description: error.message,
      });
    },
  });

  const handleSubmit = (values: CampFormValues) => {
    createMutation.mutate(values);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Créer un nouveau camp"
        description="Remplissez les informations pour créer un camp de vacances"
      />

      {isLoadingTypes ? (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      ) : campTypes && campTypes.length > 0 ? (
        <CampForm
          mode="create"
          onSubmit={handleSubmit}
          isSubmitting={createMutation.isPending}
          campTypes={campTypes}
        />
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                Aucun type de camp n'est disponible. Veuillez d'abord créer des types de camps
                dans les paramètres.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
