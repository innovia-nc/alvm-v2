export { auth, signIn, signOut } from './config';
export type { Session } from 'next-auth';

import type { Session } from 'next-auth';

export { auth as getSession } from './config';

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

export async function hasPermission(
  permission:
    | 'manage:staff'
    | 'manage:camps'
    | 'manage:invoices'
    | 'view:all:data',
): Promise<boolean> {
  const { auth } = await import('./config');
  const session = await auth();

  if (!session?.user) return false;

  const { role } = session.user;
  if (!role) return false;
  if (role === 'ADMIN') return true;

  const permissions: Record<string, boolean> = {
    'manage:staff': false,
    'manage:camps': role === 'STAFF',
    'manage:invoices': false,
    'view:all:data': false,
  };

  return permissions[permission] || false;
}

export async function getCurrentRole(): Promise<
  'PARENT' | 'STAFF' | 'ADMIN' | null
> {
  const { auth } = await import('./config');
  const session = await auth();
  return session?.user?.role || null;
}

export async function isAuthenticated(): Promise<boolean> {
  const { auth } = await import('./config');
  const session = await auth();
  return !!session?.user;
}
