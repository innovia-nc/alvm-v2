import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/shared/page-header';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import Link from 'next/link';

export default async function StaffDashboardPage() {
  // Vérifier que l'utilisateur est staff ou admin
  await requireRole(['STAFF', 'ADMIN']);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tableau de Bord"
        description="Gérez vos camps et les inscriptions"
      />

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Gestion des Camps</CardTitle>
            <CardDescription>
              Créer et gérer les camps et sessions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link
              href="/dashboard/staff/camps"
              className="block text-sm text-primary hover:underline"
            >
              → Voir les camps
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Inscriptions</CardTitle>
            <CardDescription>
              Gérer les inscriptions et les participants
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link
              href="/dashboard/staff/registrations"
              className="block text-sm text-primary hover:underline"
            >
              → Voir les inscriptions
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
