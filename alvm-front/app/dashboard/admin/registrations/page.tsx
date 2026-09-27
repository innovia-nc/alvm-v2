import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/shared/page-header';
import { Plus } from 'lucide-react';
import { AdminRegistrationsTableClient } from '@/components/admin/registrations/admin-registrations-table-client';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default async function AdminRegistrationsPage() {
  // Vérifier que l'utilisateur est admin
  await requireRole(['ADMIN']);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestion des Inscriptions"
        description="Vue d'ensemble et gestion de toutes les inscriptions"
        actions={
          <Link href="/dashboard/admin/registrations/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nouvelle inscription
            </Button>
          </Link>
        }
      />

      <AdminRegistrationsTableClient />
    </div>
  );
}
