import { ListPagination } from '@/components/shared/list-pagination';
import { auth } from '@/lib/auth/config';
import { redirect } from 'next/navigation';
import { createServerTRPC } from '@/lib/trpc';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UserPlus } from 'lucide-react';
import Link from 'next/link';
import { ChildrenCards } from './children-cards';

/**
 * Parent Children List Page
 * Displays all children of the parent with management options
 */
export default async function ParentChildrenPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
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
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <UserPlus className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-lg font-medium text-gray-900">Aucun enfant enregistré</h3>
              <p className="mt-1 text-sm text-gray-500">
                Ajoutez votre premier enfant pour commencer les inscriptions aux camps.
              </p>
              <div className="mt-6">
                <Button asChild>
                  <Link href="/dashboard/parent/children/new">
                    <UserPlus className="mr-2 h-4 w-4" />
                    Ajouter un enfant
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <ChildrenCards initialChildren={children} />
      )}
      <ListPagination page={page} total={childrenData.total} basePath="/dashboard/parent/children" />
    </div>
  );
}
