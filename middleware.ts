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
  const isPublicPage =
    nextUrl.pathname === '/' ||
    nextUrl.pathname.startsWith('/public') ||
    nextUrl.pathname.startsWith('/_next');

  if (isApiRoute) return NextResponse.next();
  if (isPublicPage) return NextResponse.next();

  if (isAuthPage && isLoggedIn) {
    return NextResponse.redirect(new URL('/dashboard', nextUrl.origin));
  }

  if (isDashboard && !isLoggedIn) {
    const callbackUrl = encodeURIComponent(nextUrl.pathname + nextUrl.search);
    return NextResponse.redirect(
      new URL(`/auth/signin?callbackUrl=${callbackUrl}`, nextUrl.origin),
    );
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|public|api/auth).*)',
  ],
};
