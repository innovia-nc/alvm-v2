'use client';

/**
 * Edit Camp Page
 *
 * Page d'édition d'un camp de vacances existant.
 * Accessible uniquement aux animateurs et directeurs.
 */

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { CampForm, CampFormValues } from '@/components/admin/camps/camp-form';
import { trpc } from '@/lib/trpc/client';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default function EditCampPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const utils = trpc.useUtils();

  // Fetch camp data
  const { data: camp, isLoading: isLoadingCamp } = trpc.camps.getById.useQuery({ id });

  // Fetch camp types
  const { data: campTypes, isLoading: isLoadingTypes } = trpc.camps.listCampTypes.useQuery();

  // Mutation pour mettre à jour le camp
  const updateMutation = trpc.camps.update.useMutation({
    onSuccess: (data) => {
      utils.camps.list.invalidate();
      utils.camps.getById.invalidate({ id });
      toast.success('Camp mis à jour avec succès', {
        description: `Le camp "${data.name}" a été modifié.`,
      });
      router.push('/dashboard/admin/camps');
    },
    onError: (error) => {
      toast.error('Erreur lors de la mise à jour', {
        description: error.message,
      });
    },
  });

  const handleSubmit = async (values: CampFormValues) => {
    await updateMutation.mutateAsync({
      id,
      name: values.name,
      description: values.description,
      location: values.location,
      maxCapacity: values.maxCapacity,
      startDate: values.startDate,
      endDate: values.endDate,
      registrationDeadline: values.registrationDeadline,
      totalPrice: values.totalPrice,
      status: values.status,
    });
  };

  const isLoading = isLoadingCamp || isLoadingTypes;
  const isSubmitting = updateMutation.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Modifier le camp"
        description={camp ? `Modification de "${camp.name}"` : 'Chargement...'}
      />

      {isLoading ? (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      ) : camp && campTypes ? (
        <CampForm
          mode="edit"
          defaultValues={{
            name: camp.name,
            description: camp.description,
            campTypeId: camp.campTypeId,
            location: camp.location,
            maxCapacity: camp.maxCapacity,
            startDate: camp.startDate ? new Date(camp.startDate).toISOString().split('T')[0]! : '',
            endDate: camp.endDate ? new Date(camp.endDate).toISOString().split('T')[0]! : '',
            registrationDeadline: new Date(camp.registrationDeadline).toISOString().split('T')[0]!,
            totalPrice: camp.pricePerDay * camp.daysCount,
            status: camp.status as 'DRAFT' | 'PUBLISHED',
          }}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
          campTypes={campTypes}
        />
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <p className="text-muted-foreground">Camp non trouvé.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
