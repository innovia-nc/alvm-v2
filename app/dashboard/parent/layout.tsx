import { requireRole } from '@/lib/auth';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';

export default async function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Vérifier que l'utilisateur a le rôle PARENT
  // Le middleware NextAuth gère déjà les redirections, mais on double-vérifie
  await requireRole(['PARENT', 'ADMIN']);

  return (
    <div className="space-y-6">
      <Breadcrumbs />
      {children}
    </div>
  );
}
