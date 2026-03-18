'use client';

import { use } from 'react';
import { CampDetailPage } from '@/components/camps/camp-detail-page';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default function StaffCampDetailPage({ params }: PageProps) {
  const { id } = use(params);

  return <CampDetailPage campId={id} basePath="/dashboard/staff/camps" />;
}
