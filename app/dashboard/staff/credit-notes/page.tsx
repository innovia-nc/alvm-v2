import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { StaffCreditNotesTableClient } from '@/components/staff/credit-notes/staff-credit-notes-table-client';
import Link from 'next/link';

export default async function StaffCreditNotesPage() {
  await requireRole(['STAFF', 'ADMIN']);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Avoirs"
        description="Consultez les notes de crédit émises"
        actions={
          <Link href="/dashboard/staff/credit-notes/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nouvel avoir
            </Button>
          </Link>
        }
      />

      {/* Table des avoirs (read-only) */}
      <StaffCreditNotesTableClient />
    </div>
  );
}
