import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/shared/page-header';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Users, Settings } from 'lucide-react';
import Link from 'next/link';

export default async function AdminDashboardPage() {
  // Vérifier que l'utilisateur est admin
  await requireRole(['ADMIN']);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard Admin"
        description="Administration et supervision du système"
      />



      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Gestion des Utilisateurs
            </CardTitle>
            <CardDescription>
              Gérer les parents et le personnel
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link
              href="/dashboard/admin/users/parents"
              className="block text-sm text-primary hover:underline"
            >
              → Voir les parents
            </Link>
            <Link
              href="/dashboard/admin/users/staff"
              className="block text-sm text-primary hover:underline"
            >
              → Voir le personnel
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Paramètres Système
            </CardTitle>
            <CardDescription>
              Configuration et paramétrage
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <a
              href="/dashboard/admin/settings/camp-types"
              className="block text-sm text-primary hover:underline"
            >
              → Types de camps
            </a>
            <a
              href="/dashboard/admin/settings/payment-methods"
              className="block text-sm text-primary hover:underline"
            >
              → Méthodes de paiement
            </a>
            <a
              href="/dashboard/admin/fec/export"
              className="block text-sm text-primary hover:underline"
            >
              → Export comptable FEC
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
