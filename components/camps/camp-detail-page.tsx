'use client';

import { useSearchParams } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Pencil, Users } from 'lucide-react';
import Link from 'next/link';
import { StatusBadge } from '@/components/shared/status-badge';
import { CampDetailTab } from './camp-detail-tab';
import { CampRegistrationsTab } from './camp-registrations-tab';
import { CampAttendanceTab } from './camp-attendance-tab';

interface CampDetailPageProps {
  campId: string;
  basePath: string; // e.g. '/dashboard/admin/camps' or '/dashboard/staff/camps'
}

export function CampDetailPage({ campId, basePath }: CampDetailPageProps) {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'details';

  const { data: camp, isLoading } = trpc.camps.getById.useQuery({ id: campId });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!camp) {
    return (
      <div className="space-y-6">
        <PageHeader title="ACM introuvable" />
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Cet ACM n&apos;existe pas ou a été supprimé.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title={camp.name}
        description={camp.location}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge type="camp" status={camp.status} />
            <Badge variant="outline" className="gap-1">
              <Users className="h-3 w-3" />
              {camp.registrationsCount} / {camp.maxCapacity}
            </Badge>
            <Link href={`${basePath}/${campId}/edit`}>
              <Button variant="outline" size="sm">
                <Pencil className="mr-2 h-4 w-4" />
                Modifier
              </Button>
            </Link>
            <Link href={basePath}>
              <Button variant="outline" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Retour
              </Button>
            </Link>
          </div>
        }
      />

      {/* Tabs */}
      <Tabs defaultValue={initialTab}>
        <TabsList>
          <TabsTrigger value="details">Détails</TabsTrigger>
          <TabsTrigger value="inscriptions">
            Inscriptions ({camp.registrationsCount})
          </TabsTrigger>
          <TabsTrigger value="presences">Présences</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <CampDetailTab camp={camp} />
        </TabsContent>

        <TabsContent value="inscriptions">
          <CampRegistrationsTab campId={campId} basePath={basePath} />
        </TabsContent>

        <TabsContent value="presences">
          <CampAttendanceTab campId={campId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
