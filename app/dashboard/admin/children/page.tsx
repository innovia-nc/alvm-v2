import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/shared/page-header';
import { Plus } from 'lucide-react';
import { AdminChildrenTableClient } from '@/components/admin/children/admin-children-table-client';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default async function AdminChildrenPage() {
  // Vérifier que l'utilisateur est admin
  await requireRole(['ADMIN']);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Gestion des Enfants"
        description="Vue d'ensemble et gestion de tous les enfants inscrits dans le système"
        actions={
          <Link href="/dashboard/admin/children/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nouvel enfant
            </Button>
          </Link>
        }
      />

      {/* Table des enfants */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Liste Complète des Enfants</h2>
        <AdminChildrenTableClient />
      </div>
    </div>
  );
}
