import { requireRole } from '@/lib/auth';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';

export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Vérifier que l'utilisateur a le rôle STAFF ou ADMIN
  await requireRole(['STAFF', 'ADMIN']);

  return (
    <div className="space-y-6">
      <Breadcrumbs />
      {children}
    </div>
  );
}
