import NextAuth, { DefaultSession, type NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { isSessionValid, verifyCredentials } from '@/server/services/auth.service';
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

/**
 * NextAuth.js v5 — connexion par identifiants, multi-tenant.
 *
 * La vérification (espace, compte, mot de passe, limitation de débit) vit dans
 * `server/services/auth.service.ts`. La session ne porte que `id`, `role` et
 * `organizationId` : ce sont les seuls champs que les gardes de page et les
 * procédures tRPC consultent.
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
        const user = await verifyCredentials({ ...credentials, portal }, request.headers);
        return user;
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
      const valid = await isSessionValid({
        id: token.id,
        role: token.role as Role,
        organizationId: token.organizationId,
        sessionVersion: token.sessionVersion,
      });
      return valid ? token : null;
    },
  },

  debug: process.env.NODE_ENV === 'development',
};

// `signIn` / `signOut` ne sont pas extraits : les écrans concernés sont des
// composants client et passent par `next-auth/react`.
export const { handlers, auth } = NextAuth(authConfig);
