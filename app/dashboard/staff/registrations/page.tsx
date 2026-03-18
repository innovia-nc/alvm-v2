import { requireRole } from '@/lib/auth';
import { createServerTRPC } from '@/lib/trpc';
import { PageHeader } from '@/components/shared/page-header';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Clock, CheckCircle, XCircle, Plus } from 'lucide-react';
import { RegistrationsTableClient } from '@/components/staff/registrations/registrations-table-client';
import Link from 'next/link';

export default async function StaffRegistrationsPage() {
  // Vérifier que l'utilisateur est staff ou admin
  await requireRole(['STAFF', 'ADMIN']);

  // Créer le client tRPC server-side
  const trpc = await createServerTRPC();

  // Récupérer toutes les inscriptions et statistiques
  const [allRegistrations, pendingRegistrations, confirmedRegistrations, cancelledRegistrations, waitlistRegistrations] = await Promise.all([
    trpc.registrations.list({ limit: 100, offset: 0 }),
    trpc.registrations.list({ limit: 100, offset: 0, status: 'PENDING' }),
    trpc.registrations.list({ limit: 100, offset: 0, status: 'CONFIRMED' }),
    trpc.registrations.list({ limit: 100, offset: 0, status: 'CANCELLED' }),
    trpc.registrations.list({ limit: 100, offset: 0, status: 'WAITLIST' }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inscriptions"
        description="Gérez toutes les inscriptions aux camps"
        actions={
          <Link href="/dashboard/staff/registrations/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nouvelle inscription
            </Button>
          </Link>
        }
      />

      {/* Stats Summary */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{allRegistrations.total}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Toutes inscriptions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">En attente</CardTitle>
            <Clock className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingRegistrations.total}</div>
            <p className="text-xs text-muted-foreground mt-1">
              À traiter
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Confirmées</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{confirmedRegistrations.total}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Validées
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Attente</CardTitle>
            <Clock className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{waitlistRegistrations.total}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Liste d'attente
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Annulées</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{cancelledRegistrations.total}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Annulations
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Registrations Table */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Liste des Inscriptions</h2>
        <RegistrationsTableClient />
      </div>
    </div>
  );
}
