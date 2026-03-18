import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth/config';

/**
 * Dashboard Root - Redirects to role-specific dashboard
 *
 * This page acts as a router that redirects authenticated users
 * to their appropriate dashboard based on their role.
 */
export default async function DashboardPage() {
  const session = await auth();

  // If not authenticated, redirect to signin
  if (!session?.user) {
    redirect('/auth/signin');
  }

  // Redirect based on user role
  const { role } = session.user;

  switch (role) {
    case 'ADMIN':
      redirect('/dashboard/admin');
    case 'STAFF':
      redirect('/dashboard/staff');
    case 'PARENT':
      redirect('/dashboard/parent');
    default:
      // Fallback to parent dashboard for unknown roles
      redirect('/dashboard/parent');
  }
}
