import { BackButton } from '@/components/shared/back-button';
import { PageHeader } from '@/components/shared/page-header';
import { OrganizationDetail } from '@/components/super-admin/organization-detail';

export default async function OrganizationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="space-y-6">
      <BackButton href="/dashboard/super-admin" label="Associations" />
      <PageHeader
        title="Association"
        description="Identité, disponibilité, modules et comptes de l’association."
      />
      <OrganizationDetail id={id} />
    </div>
  );
}
