// `signIn` / `signOut` ne sont PAS ré-exportés : les deux écrans qui déclenchent
// une (dé)connexion sont des composants clients et importent les versions
// navigateur (`next-auth/react`). Les ré-exporter ici invitait à tirer, depuis
// un composant client, un module qui charge Prisma.
export { auth } from './config';

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
