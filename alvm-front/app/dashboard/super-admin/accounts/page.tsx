import { AccountsPanel } from '@/components/platform/accounts-panel';
import { PageHeader } from '@/components/shared/page-header';
export default function PlatformAccountsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Comptes et accès"
        description="Administrez les accès à la plateforme et à l’entreprise."
      />
      <AccountsPanel />
    </div>
  );
}
