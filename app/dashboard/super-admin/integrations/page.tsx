import { IntegrationsPanel } from '@/components/platform/integrations-panel';
import { PageHeader } from '@/components/shared/page-header';
export default function PlatformIntegrationsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Intégrations et clés API"
        description="Configurez les services utilisés par l’application."
      />
      <IntegrationsPanel />
    </div>
  );
}
