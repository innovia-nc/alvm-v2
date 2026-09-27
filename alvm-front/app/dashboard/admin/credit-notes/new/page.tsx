import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/shared/page-header';
import { CreditNoteForm } from '@/components/admin/credit-notes/credit-note-form';

export default async function NewCreditNotePage() {
  await requireRole(['ADMIN']);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Créer un Avoir"
        description="Créez une note de crédit pour remboursement ou ajustement"
      />

      <CreditNoteForm />
    </div>
  );
}
