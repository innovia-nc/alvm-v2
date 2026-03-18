import { requireAuth } from '@/lib/auth';
import { DashboardSidebar } from '@/components/layout/dashboard-sidebar';
import { DashboardHeader } from '@/components/layout/dashboard-header';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Vérifier authentification et récupérer session
  const session = await requireAuth();

  // Déterminer le rôle depuis la session
  const userRole = session?.user?.role;

  const role =
    userRole === 'ADMIN'
      ? ('admin' as const)
      : userRole === 'STAFF'
      ? ('staff' as const)
      : ('parent' as const);

  return (
    <div className="min-h-screen flex">
      {/* Sidebar responsive */}
      <DashboardSidebar role={role} />

      {/* Contenu principal */}
      <div className="flex-1 flex flex-col">
        <DashboardHeader />

        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
