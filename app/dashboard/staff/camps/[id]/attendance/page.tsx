'use client';

import { use } from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { AttendancePageClient } from '@/components/staff/attendances/attendance-page-client';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default function StaffAttendancePage({ params }: PageProps) {
  const { id } = use(params);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Présences"
        description="Gérer les présences des enfants inscrits"
        actions={
          <Link href={`/dashboard/staff/camps/${id}`}>
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour au camp
            </Button>
          </Link>
        }
      />

      <AttendancePageClient campId={id} />
    </div>
  );
}
