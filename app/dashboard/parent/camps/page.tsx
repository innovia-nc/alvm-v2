import { EmptyState } from '@/components/shared/empty-state';
import { ListPagination } from '@/components/shared/list-pagination';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { auth } from '@/lib/auth/config';
import { createServerTRPC } from '@/lib/trpc';
import { Calendar, DollarSign, MapPin, Users } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

/**
 * Parent Camps List Page
 * Displays available camps for registration
 */
export default async function ParentCampsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth();

  if (!session?.user || session.user.role !== 'PARENT') {
    redirect('/auth/signin');
  }

  const page = Math.max(1, Math.floor(Number((await searchParams).page) || 1));
  const trpc = await createServerTRPC();
  const campsData = await trpc.camps.list({ limit: 20, offset: (page - 1) * 20 });
  const camps = campsData.camps;

  // Filter only published camps
  const availableCamps = camps.filter((camp) => camp.status === 'PUBLISHED');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Camps disponibles"
        description="Découvrez les camps disponibles pour inscrire vos enfants"
      />

      {availableCamps.length === 0 ? (
        <EmptyState
          title="Aucun camp disponible"
          description={<>Aucun camp n'est actuellement ouvert aux inscriptions.</>}
          icon={Calendar}
        />
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
                <div className="flex items-center text-sm text-muted-foreground">
                  <Calendar className="mr-2 h-4 w-4" />
                  {camp.daysCount} jour{camp.daysCount > 1 ? 's' : ''}
                </div>

                {/* Location */}
                {camp.location && (
                  <div className="flex items-center text-sm text-muted-foreground">
                    <MapPin className="mr-2 h-4 w-4" />
                    {camp.location}
                  </div>
                )}

                {/* Camp Type */}
                {camp.campType.description && (
                  <div className="flex items-center text-sm text-muted-foreground">
                    <Users className="mr-2 h-4 w-4" />
                    {camp.campType.description}
                  </div>
                )}

                {/* Price */}
                <div className="flex items-center text-sm font-medium text-foreground">
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
      <ListPagination page={page} total={campsData.total} basePath="/dashboard/parent/camps" />
    </div>
  );
}
