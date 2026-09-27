import { ConfigurationForm } from '@/components/platform/configuration-form';
import { PageHeader } from '@/components/shared/page-header';
export default function PlatformConfigurationPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuration de la plateforme"
        description="Identité de l’application et état de son infrastructure."
      />
      <ConfigurationForm />
    </div>
  );
}
