import { requireRole } from '@/lib/auth';
import { createServerTRPC } from '@/lib/trpc';
import { PageHeader } from '@/components/shared/page-header';
import { UsersDetails } from '@/components/admin/users/user-details';
import { notFound } from 'next/navigation';

export default async function ChildDetailPage({
    params,
    }: {
    params: Promise<{ id: string }>;
    }) {
    await requireRole(['ADMIN']);

    const { id } = await params;

    const trpc = await createServerTRPC();

    const user = await trpc.users.getById({ id });

    if (!user) {
        notFound();
    }

    return (
        <div className="space-y-8">
        <PageHeader
            title="Détails du personnel ALVM"
            description={`${user.name ?? ''} ${user.email}`.trim()}
        />

        <UsersDetails user={user} />
        </div>
    );
    }
