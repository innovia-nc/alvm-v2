import { recordPlatformAudit } from '@/server/services/platform-audit.service';
import NextAuth, { DefaultSession, type NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { consumeLoginAttempt } from '@/server/services/login-limit.service';
import { authEdgeConfig } from './auth.config';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role?: 'PARENT' | 'STAFF' | 'ADMIN' | 'SUPER_ADMIN';
    } & DefaultSession['user'];
  }

  interface User {
    role?: 'PARENT' | 'STAFF' | 'ADMIN' | 'SUPER_ADMIN';
    sessionVersion?: number;
  }
}

const signInSchema = z.object({
  email: z.string().email().toLowerCase(),
  portal: z.enum(['standard', 'super-admin']).default('standard'),
  password: z.string().min(1).max(128),
});

/**
 * NextAuth.js v5 Configuration for ALVM (monolith)
 *
 * Credentials provider verifies directly against Prisma DB.
 * No more HTTP call to a separate backend.
 *
 * Password hash is stored in Account.providerAccountId
 * where provider = 'credentials'.
 *
 * La session ne porte que `id` et `role` : ce sont les deux seuls champs que
 * les gardes de page et les procédures tRPC consultent. Le rôle par
 * permissions (ANIMATOR) que la session transportait a été abandonné en juin
 * — sa garde `animatorProcedure` est partie avec la deuxième passe de code
 * mort, la revendication qu'elle lisait avec la sixième.
 */
const authConfig: NextAuthConfig = {
  ...authEdgeConfig,

  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        portal: { label: 'Portal', type: 'text' },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const parsed = signInSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password, portal } = parsed.data;
        if (!(await consumeLoginAttempt(email, request.headers))) return null;

        const user = await prisma.user.findUnique({
          where: { email },
          include: {
            accounts: {
              where: { provider: 'credentials' },
              select: { providerAccountId: true },
            },
          },
        });

        if (!user || user.disabledAt || user.accounts.length === 0) return null;

        if ((user.role === 'SUPER_ADMIN') !== (portal === 'super-admin')) return null;

        const isValid = await compare(password, user.accounts[0].providerAccountId);
        if (!isValid) {
          await recordPlatformAudit(prisma, null, 'auth.login_failed', user.id, 'FAILED');
          return null;
        }
        await recordPlatformAudit(prisma, user.id, 'auth.login', user.role);

        return {
          id: user.id,
          sessionVersion: user.sessionVersion,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role as 'PARENT' | 'STAFF' | 'ADMIN' | 'SUPER_ADMIN',
        };
      },
    }),
  ],

  callbacks: {
    ...authEdgeConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.sessionVersion = user.sessionVersion;
      }
      if (!token.id || typeof token.sessionVersion !== 'number') return null;
      const current = await prisma.user.findUnique({ where: { id: String(token.id) } });
      if (
        !current ||
        current.disabledAt ||
        current.sessionVersion !== token.sessionVersion ||
        current.role !== token.role
      )
        return null;
      return token;
    },
  },

  debug: process.env.NODE_ENV === 'development',
};

// `signIn` / `signOut` ne sont pas extraits : les trois écrans concernés
// (`components/auth/signin-form.tsx`, `app/auth/signout/page.tsx`,
// `components/layout/dashboard-header.tsx`) sont des composants client et
// passent par `next-auth/react`. Les versions serveur n'ont jamais eu
// d'appelant — la quatrième passe avait retiré leur réexport du barrel
// `lib/auth/index.ts`, la source restait.
export const { handlers, auth } = NextAuth(authConfig);
