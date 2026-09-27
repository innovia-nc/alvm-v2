'use client';
import { BackButton } from '@/components/shared/back-button';

import { PageHeader } from '@/components/shared/page-header';
import { AttendancePageClient } from '@/components/staff/attendances/attendance-page-client';
import { use } from 'react';

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
        actions={<BackButton href={`/dashboard/staff/camps/${id}`} label="Retour à l'ACM" />}
      />

      <AttendancePageClient campId={id} />
    </div>
  );
}
