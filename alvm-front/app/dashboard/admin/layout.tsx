import { requireRole } from '@/lib/auth';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Vérifier que l'utilisateur a le rôle ADMIN
  // Le badge "Admin" visible est rendu par <DashboardHeader />.
  await requireRole(['ADMIN']);

  return (
    <div className="space-y-6">
      <Breadcrumbs />
      {children}
    </div>
  );
}
