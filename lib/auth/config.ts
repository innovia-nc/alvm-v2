import NextAuth, { DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/server/db';
import { authEdgeConfig } from './auth.config';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role?: 'PARENT' | 'STAFF' | 'ADMIN';
      staffRole?: 'ANIMATOR';
    } & DefaultSession['user'];
  }

  interface User {
    role?: 'PARENT' | 'STAFF' | 'ADMIN';
    staffRole?: 'ANIMATOR';
  }
}

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * NextAuth.js v5 Configuration for ALVM (monolith)
 *
 * Credentials provider verifies directly against Prisma DB.
 * No more HTTP call to a separate backend.
 *
 * Password hash is stored in Account.providerAccountId
 * where provider = 'credentials'.
 */
const authConfig = {
  ...authEdgeConfig,

  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const parsed = signInSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({
          where: { email },
          include: {
            accounts: {
              where: { provider: 'credentials' },
              select: { providerAccountId: true },
            },
            staffMember: { select: { userId: true } },
          },
        });

        if (!user || user.accounts.length === 0) return null;

        const isValid = await compare(password, user.accounts[0].providerAccountId);
        if (!isValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role as 'PARENT' | 'STAFF' | 'ADMIN',
          staffRole: user.staffMember ? ('ANIMATOR' as const) : undefined,
        };
      },
    }),
  ],

  debug: process.env.NODE_ENV === 'development',
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
