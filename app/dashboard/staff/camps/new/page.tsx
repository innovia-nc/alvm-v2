'use client';

import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { CampForm, CampFormValues } from '@/components/admin/camps/camp-form';
import { trpc } from '@/lib/trpc/client';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function StaffNewCampPage() {
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
      router.push('/dashboard/staff/camps');
      router.refresh();
    },
    onError: (error) => {
      toast.error('Erreur lors de la création', {
        description: error.message,
      });
    },
  });

  const handleSubmit = (data: CampFormValues) => {
    createMutation.mutate(data);
  };

  if (isLoadingTypes) {
    return (
      <div className="space-y-6">
        <PageHeader title="Chargement..." description="Récupération des types de camps" />

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nouvel ACM"
        description="Créer un nouvel ACM"
      />

      <div className="max-w-4xl">
        <CampForm
          mode="create"
          onSubmit={handleSubmit}
          isSubmitting={createMutation.isPending}
          campTypes={campTypes || []}
        />
      </div>
    </div>
  );
}
