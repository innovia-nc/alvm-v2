import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { AdminCreditNotesTableClient } from '@/components/admin/credit-notes/admin-credit-notes-table-client';

export default async function AdminCreditNotesPage() {
  await requireRole(['ADMIN']);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Gestion des Avoirs"
        description="Créez et gérez les notes de crédit"
        actions={
          <Link href="/dashboard/admin/credit-notes/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nouvel avoir
            </Button>
          </Link>
        }
      />

      {/* Table des avoirs */}
      <AdminCreditNotesTableClient />
    </div>
  );
}
