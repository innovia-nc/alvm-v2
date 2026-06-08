import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { ChildrenTableClient } from '@/components/staff/children/children-table-client';

export default async function StaffChildrenPage() {
  // Vérifier que l'utilisateur est staff ou admin
  await requireRole(['STAFF', 'ADMIN']);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestion des Enfants / Stagiaires"
        description="Gérez les informations des enfants inscrits aux camps"
        actions={
          <Link href="/dashboard/staff/children/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Ajouter un enfant
            </Button>
          </Link>
        }
      />

      <ChildrenTableClient />
    </div>
  );
}
