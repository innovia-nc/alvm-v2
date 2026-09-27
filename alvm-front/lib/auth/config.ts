import NextAuth, { DefaultSession, type NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { postInternal } from '@/lib/api/back';
import { authEdgeConfig } from './auth.config';

type Role = 'PARENT' | 'STAFF' | 'ADMIN' | 'SUPER_ADMIN';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role?: Role;
      /** Tenant de la session (espace de plateforme pour un SUPER_ADMIN). */
      organizationId?: string;
    } & DefaultSession['user'];
  }

  interface User {
    role?: Role;
    organizationId?: string;
    sessionVersion?: number;
  }
}

interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  role: Role;
  organizationId: string;
  sessionVersion: number;
}

/**
 * NextAuth.js v5 — connexion par identifiants, multi-tenant.
 *
 * Le front ne touche pas la base : la vérification (espace, compte, mot de
 * passe, limitation de débit) est faite par le back
 * (`POST /api/internal/auth/credentials`, `alvm-back/src/services/auth.service.ts`).
 * La session ne porte que `id`, `role` et `organizationId` : ce sont les seuls
 * champs que les gardes de page et les procédures tRPC consultent.
 */
const authConfig: NextAuthConfig = {
  ...authEdgeConfig,

  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        organization: { label: 'Espace', type: 'text' },
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        portal: { label: 'Portal', type: 'text' },
      },
      async authorize(credentials, request) {
        const portal = credentials?.portal === 'super-admin' ? 'super-admin' : 'standard';
        return postInternal<AuthenticatedUser>(
          '/api/internal/auth/credentials',
          { ...credentials, portal },
          request.headers,
        ).catch(() => null);
      },
    }),
  ],

  callbacks: {
    ...authEdgeConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.organizationId = user.organizationId;
        token.sessionVersion = user.sessionVersion;
      }
      if (
        typeof token.id !== 'string' ||
        typeof token.organizationId !== 'string' ||
        typeof token.sessionVersion !== 'number' ||
        !token.role
      )
        return null;
      // Révocation immédiate (compte désactivé, sessions révoquées, association
      // suspendue) : le back revalide à chaque résolution de session. Back
      // injoignable = session refusée (fail-closed).
      const result = await postInternal<{ valid: boolean }>(
        '/api/internal/auth/session',
        {
          id: token.id,
          role: token.role,
          organizationId: token.organizationId,
          sessionVersion: token.sessionVersion,
        },
        new Headers(),
      ).catch(() => null);
      return result?.valid ? token : null;
    },
  },

  debug: process.env.NODE_ENV === 'development',
};

// `signIn` / `signOut` ne sont pas extraits : les écrans concernés sont des
// composants client et passent par `next-auth/react`.
export const { handlers, auth } = NextAuth(authConfig);
