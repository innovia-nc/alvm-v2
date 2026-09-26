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
export default async function NewChildPage() {
  const session = await auth();

  if (!session?.user || session.user.role !== 'PARENT') {
    redirect('/auth/signin');
  }

  return (
    <div className="space-y-6">
      <Link className="block underline mb-4" href="/dashboard/parent/children/adult">
        Inscrire un participant adulte autonome
      </Link>
      <div className="flex items-center gap-4">
        <BackButton href="/dashboard/parent/children" />
        <PageHeader
          title="Ajouter un enfant"
          description="Enregistrez un nouvel enfant pour l'inscrire aux camps"
        />
      </div>

      <ChildForm />
    </div>
  );
}
