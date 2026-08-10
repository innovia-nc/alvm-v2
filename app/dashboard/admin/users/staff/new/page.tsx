'use client';

import { StaffCreateForm } from '@/components/admin/users/staff-create-form';

export default function NewStaffPage() {
  return <StaffCreateForm listPath="/dashboard/admin/users/staff" />;
}
