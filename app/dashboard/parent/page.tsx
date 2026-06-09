import { requireAuth } from '@/lib/auth';
import { PageHeader } from '@/components/shared/page-header';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Users, CalendarDays, FileText } from 'lucide-react';
import Link from 'next/link';

export default async function ParentDashboardPage() {
  // Vérifier l'authentification
  await requireAuth();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Bienvenue sur votre espace parent"
        description="Gérez les inscriptions et suivez les activités de vos enfants"
      />

      {/* Actions rapides */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Actions rapides</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="hover:bg-muted/50 transition-colors">
            <Link href="/dashboard/parent/children/new">
              <CardHeader>
                <Users className="h-8 w-8 text-primary mb-2" />
                <CardTitle>Ajouter un enfant</CardTitle>
                <CardDescription>
                  Inscrire un nouvel enfant dans votre espace
                </CardDescription>
              </CardHeader>
            </Link>
          </Card>

          <Card className="hover:bg-muted/50 transition-colors">
            <Link href="/dashboard/parent/camps">
              <CardHeader>
                <CalendarDays className="h-8 w-8 text-primary mb-2" />
                <CardTitle>Découvrir les camps</CardTitle>
                <CardDescription>Parcourir les camps disponibles</CardDescription>
              </CardHeader>
            </Link>
          </Card>

          <Card className="hover:bg-muted/50 transition-colors">
            <Link href="/dashboard/parent/registrations">
              <CardHeader>
                <FileText className="h-8 w-8 text-primary mb-2" />
                <CardTitle>Mes inscriptions</CardTitle>
                <CardDescription>
                  Gérer les inscriptions de mes enfants
                </CardDescription>
              </CardHeader>
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
