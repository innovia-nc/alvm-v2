import { auth } from '@/lib/auth/config';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/shared/page-header';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
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
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <Link href="/dashboard/parent/children">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <PageHeader
          title="Ajouter un enfant"
          description="Enregistrez un nouvel enfant pour l'inscrire aux camps"
        />
      </div>

      <ChildForm />
    </div>
  );
}
