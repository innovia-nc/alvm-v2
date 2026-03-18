import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { CampsTableClient } from '@/components/staff/camps/camps-table-client';

export default async function StaffCampsPage() {
  // Vérifier que l'utilisateur est staff ou admin
  await requireRole(['STAFF', 'ADMIN']);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mes Camps"
        description="Gérez et suivez tous vos camps d'activités"
        actions={
          <Link href="/dashboard/staff/camps/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Créer un camp
            </Button>
          </Link>
        }
      />

      <CampsTableClient />
    </div>
  );
}
