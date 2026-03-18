import { requireAuth } from '@/lib/auth';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAuth();

  return (
    <div className="flex min-h-screen">
      {/* TODO: Migrate DashboardSidebar component */}
      <aside className="hidden w-64 border-r bg-card md:block">
        <div className="p-4 font-bold text-lg">ALVM</div>
        <nav className="p-2 text-sm text-muted-foreground">
          Sidebar a migrer
        </nav>
      </aside>
      <main className="flex-1">
        {/* TODO: Migrate DashboardHeader component */}
        <header className="border-b bg-card px-6 py-3">
          <span className="text-sm text-muted-foreground">Header a migrer</span>
        </header>
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
