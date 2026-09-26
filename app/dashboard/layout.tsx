import { requireAuth } from '@/lib/auth';
import { DashboardSidebar } from '@/components/layout/dashboard-sidebar';
import { DashboardHeader } from '@/components/layout/dashboard-header';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
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
    <div className="min-h-screen flex bg-muted/40">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:p-3 focus:shadow-lg"
      >
        Aller au contenu principal
      </a>
      {/* Sidebar responsive */}
      <DashboardSidebar role={role} />

      {/* Contenu principal */}
      <div className="min-w-0 flex-1 flex flex-col">
        <DashboardHeader />

        <main
          id="main-content"
          tabIndex={-1}
          className="min-w-0 flex-1 p-4 outline-none md:p-6 lg:p-8"
        >
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
