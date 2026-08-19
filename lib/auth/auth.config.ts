/**
 * NextAuth.js v5 - Edge-compatible configuration
 *
 * Contains ONLY config that can run in the Edge runtime.
 * Used by middleware.ts for route protection.
 * Extended by config.ts with providers for full auth.
 */

import type { NextAuthConfig } from 'next-auth';

export const authEdgeConfig = {
  trustHost: true,

  session: {
    strategy: 'jwt',
  },

  // Pas de `newUser` : NextAuth ne redirige vers cette page qu'a la premiere
  // connexion signalee par un adapter de base de donnees. Cette application
  // n'a pas d'adapter (sessions JWT, provider `credentials` uniquement) — la
  // cle etait donc inerte, et laissait croire a un parcours de premiere
  // connexion qui n'existe pas. Retiree a la sixieme passe de code mort.
  pages: {
    signIn: '/auth/signin',
    signOut: '/auth/signout',
    error: '/auth/error',
  },

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.staffRole = user.staffRole;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as 'PARENT' | 'STAFF' | 'ADMIN';
        session.user.staffRole = token.staffRole as 'ANIMATOR' | undefined;
      }
      return session;
    },
  },

  providers: [],
} satisfies NextAuthConfig;
