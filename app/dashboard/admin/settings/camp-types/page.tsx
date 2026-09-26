import { createServerTRPC } from '@/lib/trpc';
import { CampTypesTable } from './camp-types-table';

export default async function CampTypesPage() {
  const trpc = await createServerTRPC();
  const campTypes = await trpc.campTypes.listAll();

  return <CampTypesTable initialCampTypes={campTypes} />;
}
