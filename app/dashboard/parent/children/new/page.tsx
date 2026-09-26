import { BackButton } from '@/components/shared/back-button';
import { PageHeader } from '@/components/shared/page-header';
import { auth } from '@/lib/auth/config';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChildForm } from './child-form';

/**
 * Add Child Page
 * Form to add a new child to parent's profile
 */
export default async function NewChildPage({
  searchParams,
}: {
  searchParams: Promise<{ campId?: string }>;
}) {
  const { campId } = await searchParams;
  const returnTo =
    campId && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(campId)
      ? `/dashboard/parent/camps/${campId}#inscription`
      : '/dashboard/parent/children';
  const session = await auth();

  if (!session?.user || session.user.role !== 'PARENT') {
    redirect('/auth/signin');
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ajouter un enfant"
        description="Créez sa fiche avant de l’inscrire à un camp."
        actions={
          <BackButton
            href={returnTo}
            label={returnTo.includes('/camps/') ? 'Retour au camp' : 'Mes enfants'}
          />
        }
      />
      <p className="text-sm text-muted-foreground">
        L’inscription concerne un adulte ?{' '}
        <Link
          className="font-medium text-primary underline"
          href="/dashboard/parent/children/adult"
        >
          Ajouter un participant adulte
        </Link>
      </p>
      <ChildForm returnTo={returnTo} />
    </div>
  );
}
