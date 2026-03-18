import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';

export default async function DashboardPage() {
  const session = await requireAuth();
  const role = session.user.role;

  switch (role) {
    case 'ADMIN':
      redirect('/dashboard/admin');
    case 'STAFF':
      redirect('/dashboard/staff');
    case 'PARENT':
      redirect('/dashboard/parent');
    default:
      redirect('/auth/signin');
  }
}
