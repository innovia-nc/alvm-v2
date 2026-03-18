import { auth } from '@/lib/auth/config';
import { redirect } from 'next/navigation';
import { createServerTRPC } from '@/lib/trpc';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, MapPin, Users, DollarSign } from 'lucide-react';
import Link from 'next/link';

/**
 * Parent Camps List Page
 * Displays available camps for registration
 */
export default async function ParentCampsPage() {
  const session = await auth();

  if (!session?.user || session.user.role !== 'PARENT') {
    redirect('/auth/signin');
  }

  const trpc = await createServerTRPC();
  const campsData = await trpc.camps.list({ limit: 100, offset: 0 });
  const camps = campsData.camps;

  // Filter only published camps
  const availableCamps = camps.filter(
    (camp) => camp.status === 'PUBLISHED'
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Camps disponibles"
        description="Découvrez les camps disponibles pour inscrire vos enfants"
      />

      {availableCamps.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Calendar className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-lg font-medium text-gray-900">Aucun camp disponible</h3>
              <p className="mt-1 text-sm text-gray-500">
                Aucun camp n'est actuellement ouvert aux inscriptions.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {availableCamps.map((camp) => (
            <Card key={camp.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <CardTitle className="text-xl">{camp.name}</CardTitle>
                  <Badge variant={camp.status === 'PUBLISHED' ? 'default' : 'secondary'}>
                    {camp.status === 'PUBLISHED' ? 'Ouvert' : camp.status}
                  </Badge>
                </div>
                <CardDescription className="line-clamp-2">{camp.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Days count */}
                <div className="flex items-center text-sm text-gray-600">
                  <Calendar className="mr-2 h-4 w-4" />
                  {camp.daysCount} jour{camp.daysCount > 1 ? 's' : ''}
                </div>

                {/* Location */}
                {camp.location && (
                  <div className="flex items-center text-sm text-gray-600">
                    <MapPin className="mr-2 h-4 w-4" />
                    {camp.location}
                  </div>
                )}

                {/* Camp Type */}
                {camp.campType.description && (
                  <div className="flex items-center text-sm text-gray-600">
                    <Users className="mr-2 h-4 w-4" />
                    {camp.campType.description}
                  </div>
                )}

                {/* Price */}
                <div className="flex items-center text-sm font-medium text-gray-900">
                  <DollarSign className="mr-2 h-4 w-4" />
                  {camp.pricePerDay.toLocaleString('fr-FR')} XPF / jour
                </div>

                {/* Actions */}
                <div className="pt-4">
                  <Button asChild className="w-full">
                    <Link href={`/dashboard/parent/camps/${camp.id}`}>
                      Voir les détails et inscrire
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
