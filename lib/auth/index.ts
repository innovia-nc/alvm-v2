export { auth, signIn, signOut } from './config';
export type { Session } from 'next-auth';

import type { Session } from 'next-auth';

export async function requireAuth(): Promise<Session> {
  const { auth } = await import('./config');
  const session = await auth();

  if (!session?.user) {
    const { redirect } = await import('next/navigation');
    redirect('/auth/signin');
  }

  return session as Session;
}

export async function requireRole(
  allowedRoles: Array<'PARENT' | 'STAFF' | 'ADMIN'>,
) {
  const session = await requireAuth();

  if (!session.user.role || !allowedRoles.includes(session.user.role)) {
    const { redirect } = await import('next/navigation');
    redirect('/dashboard');
  }

  return session;
}
