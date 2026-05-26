'use client';

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

export default function StaffEditCampPage({ params }: PageProps) {
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
      router.push('/dashboard/staff/camps');
      router.refresh();
    },
    onError: (error) => {
      toast.error('Erreur lors de la mise à jour', {
        description: error.message,
      });
    },
  });

  const handleSubmit = (data: CampFormValues) => {
    updateMutation.mutate({
      id,
      ...data,
    });
  };

  if (isLoadingCamp || isLoadingTypes) {
    return (
      <div className="space-y-6">
        <PageHeader title="Chargement..." description="Récupération des données du camp" />

        <Card>
          <CardContent className="pt-6 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!camp) {
    return (
      <div className="space-y-6">
        <PageHeader title="ACM introuvable" description="Cet ACM n'existe pas ou plus" />
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Le camp demandé n'a pas pu être trouvé.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Modifier ${camp.name}`}
        description="Mettre à jour les informations du camp"
      />

      <div className="max-w-4xl">
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
            registrationDeadline: new Date(camp.registrationDeadline)
              .toISOString()
              .split('T')[0]!,
            totalPrice: parseFloat(camp.pricePerDay.toString()) * camp.daysCount,
            status: camp.status as 'DRAFT' | 'PUBLISHED',
          }}
          onSubmit={handleSubmit}
          isSubmitting={updateMutation.isPending}
          campTypes={campTypes || []}
        />
      </div>
    </div>
  );
}
