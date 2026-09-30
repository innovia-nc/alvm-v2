import { OrganizationsPanel } from '@/components/super-admin/organizations-panel';
import { PageHeader } from '@/components/shared/page-header';
export default function SuperAdminPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Associations"
        description="Créez les espaces des associations, réglez leurs modules et leur disponibilité."
      />
      <OrganizationsPanel />
    </div>
  );
}
