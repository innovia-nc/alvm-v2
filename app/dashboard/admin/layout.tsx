import { requireRole } from '@/lib/auth';
import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ShieldCheck } from 'lucide-react';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Vérifier que l'utilisateur a le rôle ADMIN
  await requireRole(['ADMIN']);

  return (
    <div className="space-y-6">
      {/* Badge admin visible */}
      <Alert className="border-primary bg-primary/10">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <AlertDescription>
          <strong>Mode Administrateur</strong> - Accès complet au système
        </AlertDescription>
      </Alert>

      <Breadcrumbs />
      {children}
    </div>
  );
}
