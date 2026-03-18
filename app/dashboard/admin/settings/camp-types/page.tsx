import { createServerTRPC } from '@/lib/trpc';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { CampTypesTable } from './camp-types-table';

export default async function CampTypesPage() {
  const trpc = await createServerTRPC();
  const campTypes = await trpc.campTypes.listAll();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Types de Camps"
        description="Configuration des types de camps disponibles"
      />

      <Card>
        <CardContent className="p-6">
          <CampTypesTable initialCampTypes={campTypes} />
        </CardContent>
      </Card>
    </div>
  );
}
