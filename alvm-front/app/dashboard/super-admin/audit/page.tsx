import { AuditLog } from '@/components/platform/audit-log';
import { PageHeader } from '@/components/shared/page-header';
export default function PlatformAuditPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Journal d’audit"
        description="Suivez les accès et les changements de configuration."
      />
      <AuditLog />
    </div>
  );
}
