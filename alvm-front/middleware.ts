import NextAuth from 'next-auth';
import { authEdgeConfig } from '@/lib/auth/auth.config';
import { NextResponse } from 'next/server';

const { auth } = NextAuth(authEdgeConfig);

export default auth((req) => {
  const { nextUrl, auth } = req;
  const isLoggedIn = !!auth?.user;

  const isAuthPage = nextUrl.pathname.startsWith('/auth');
  const isDashboard = nextUrl.pathname.startsWith('/dashboard');
  const isApiRoute = nextUrl.pathname.startsWith('/api');
  // Pas de branche `/public` : Next sert les fichiers de `public/` à la racine
  // du site, jamais sous `/public` — et le dépôt n'a même pas ce dossier.
  const isPublicPage = nextUrl.pathname === '/' || nextUrl.pathname.startsWith('/_next');

  if (isApiRoute) return NextResponse.next();
  if (isPublicPage) return NextResponse.next();

  // Edge cannot validate sessionVersion against the database. Keep login and
  // recovery reachable when the Node runtime has revoked an old JWT.
  if (isAuthPage) return NextResponse.next();

  if (isDashboard && !isLoggedIn) {
    const callbackUrl = encodeURIComponent(nextUrl.pathname + nextUrl.search);
    return NextResponse.redirect(
      new URL(
        `${nextUrl.pathname.startsWith('/dashboard/super-admin') ? '/auth/super-admin' : '/auth/signin'}?callbackUrl=${callbackUrl}`,
        nextUrl.origin,
      ),
    );
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth).*)'],
};
