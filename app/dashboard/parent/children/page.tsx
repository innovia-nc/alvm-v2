import { EmptyState } from '@/components/shared/empty-state';
import { ListPagination } from '@/components/shared/list-pagination';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { auth } from '@/lib/auth/config';
import { createServerTRPC } from '@/lib/trpc';
import { UserPlus } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChildrenCards } from './children-cards';

/**
 * Parent Children List Page
 * Displays all children of the parent with management options
 */
export default async function ParentChildrenPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth();

  if (!session?.user || session.user.role !== 'PARENT') {
    redirect('/auth/signin');
  }

  const page = Math.max(1, Math.floor(Number((await searchParams).page) || 1));
  const trpc = await createServerTRPC();

  // Get children
  const childrenData = await trpc.children.list({ limit: 20, offset: (page - 1) * 20 });
  const children = childrenData.children;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mes enfants"
        description="Gérez les informations de vos enfants"
        actions={
          <Button asChild>
            <Link href="/dashboard/parent/children/new">
              <UserPlus className="mr-2 h-4 w-4" />
              Ajouter un enfant
            </Link>
          </Button>
        }
      />

      {children.length === 0 ? (
        <EmptyState
          title="Aucun enfant enregistré"
          description={<>Ajoutez votre premier enfant pour commencer les inscriptions aux camps.</>}
          icon={UserPlus}
          action={
            <>
              <div className="mt-6">
                <Button asChild>
                  <Link href="/dashboard/parent/children/new">
                    <UserPlus className="mr-2 h-4 w-4" />
                    Ajouter un enfant
                  </Link>
                </Button>
              </div>
            </>
          }
        />
      ) : (
        <ChildrenCards initialChildren={children} />
      )}
      <ListPagination
        page={page}
        total={childrenData.total}
        basePath="/dashboard/parent/children"
      />
    </div>
  );
}
