import { FeatureControls } from '@/components/super-admin/feature-controls';
import { PageHeader } from '@/components/shared/page-header';
export default function SuperAdminPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Super administration"
        description="Pilotez la disponibilité des fonctionnalités pour tous les utilisateurs."
      />
      <FeatureControls />
    </div>
  );
}
