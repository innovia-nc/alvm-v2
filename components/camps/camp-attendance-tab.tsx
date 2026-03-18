'use client';

import { AttendancePageClient } from '@/components/staff/attendances/attendance-page-client';

interface CampAttendanceTabProps {
  campId: string;
}

export function CampAttendanceTab({ campId }: CampAttendanceTabProps) {
  return <AttendancePageClient campId={campId} showHeader={false} />;
}
