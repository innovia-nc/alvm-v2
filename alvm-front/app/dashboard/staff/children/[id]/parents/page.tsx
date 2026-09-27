import { BreadcrumbProvider } from '@/components/layout/breadcrumb-provider';
import { BackButton } from '@/components/shared/back-button';
import { PageHeader } from '@/components/shared/page-header';
import { ManageParents } from '@/components/staff/children/manage-parents';
import { requireRole } from '@/lib/auth';
import { createServerTRPC, notFoundOnMissing } from '@/lib/trpc';
import { notFound } from 'next/navigation';

interface ManageParentsPageProps {
  params: Promise<{ id: string }>;
}

export default async function ManageParentsPage({ params }: ManageParentsPageProps) {
  // Vérifier que l'utilisateur est staff ou admin
  await requireRole(['STAFF', 'ADMIN']);

  const { id } = await params;

  // Créer le client tRPC server-side
  const trpc = await createServerTRPC();

  // Récupérer l'enfant avec ses parents
  const child = await trpc.children.getById.query({ id }).catch(notFoundOnMissing);

  if (!child) {
    notFound();
  }

  return (
    <BreadcrumbProvider
      items={[
        { href: '/dashboard/staff', label: 'Espace Personnel' },
        { href: '/dashboard/staff/children', label: 'Enfants' },
        {
          href: `/dashboard/staff/children/${id}/edit`,
          label: `${child.firstName} ${child.lastName}`,
        },
        { label: 'Parents' },
      ]}
    >
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <BackButton href={`/dashboard/staff/children/${id}/edit`} label="Retour à l'édition" />
          <PageHeader
            title={`Gérer les parents de ${child.firstName} ${child.lastName}`}
            description="Ajouter, retirer ou modifier les parents associés à cet enfant"
          />
        </div>

        {/* Composant de gestion des parents */}
        <div className="max-w-4xl">
          <ManageParents childId={id} initialParents={child.parents} />
        </div>
      </div>
    </BreadcrumbProvider>
  );
}
