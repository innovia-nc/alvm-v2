import { requireRole } from '@/lib/auth';
import { createServerTRPC } from '@/lib/trpc';
import { PageHeader } from '@/components/shared/page-header';
import { ChildEditWithDocuments } from '@/components/shared/child-edit-with-documents';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface EditChildPageProps {
  params: Promise<{ id: string }>;
}

export default async function ParentEditChildPage({ params }: EditChildPageProps) {
  await requireRole(['PARENT', 'ADMIN']);

  const { id } = await params;

  const trpc = await createServerTRPC();

  const child = await trpc.children.getById({ id });

  if (!child) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Modifier ${child.firstName} ${child.lastName}`}
        description="Mettre à jour les informations de l'enfant"
        actions={
          <Link href="/dashboard/parent/children">
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour
            </Button>
          </Link>
        }
      />

      {/* Formulaire + Documents */}
      <ChildEditWithDocuments child={child} userRole="PARENT" />
    </div>
  );
}
