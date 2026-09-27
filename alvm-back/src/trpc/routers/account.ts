import { getBranding } from '@back/services/platform-config.service';
import { recordPlatformAudit } from '@back/services/platform-audit.service';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { compare, hash } from 'bcryptjs';
import { randomBytes, createHash } from 'node:crypto';
import { router, protectedProcedure, publicProcedure } from '@back/trpc/trpc.init';
import { BCRYPT_ROUNDS } from '@back/helpers/password';
import { lockAdministrators } from '@back/services/account-access.service';
import { consumeLoginAttempt } from '@back/services/login-limit.service';
import { organizationSlugSchema } from '@back/services/auth.service';
import { withDbContext } from '@back/db-context';
import {
  sendEmail,
  getEmailSender,
  isEmailConfigured,
  escapeHtml,
} from '@back/services/email.service';

const password = z.string().min(8).max(128).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/);
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const accountRouter = router({
  // Identité affichée sur « Mon compte ». La sortie est bornée (§5.9) : aucun
  // ajout au select ne peut faire fuiter le compte de connexion.
  me: protectedProcedure
    .output(z.object({ name: z.string().nullable(), email: z.string() }).nullable())
    .query(({ ctx }) =>
      ctx.prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { name: true, email: true },
      }),
    ),
  update: protectedProcedure
    .input(
      z.object({
        name: z.string().min(2).max(100),
        email: z.string().email(),
        currentPassword: z.string().min(1),
        newPassword: password.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Le hash n'est lu que pour la vérification : jamais renvoyé.
      const credential = await ctx.prisma.account.findFirst({
        where: { userId: ctx.user.id, provider: 'credentials' },
        select: { id: true, providerAccountId: true },
      });
      if (!credential || !(await compare(input.currentPassword, credential.providerAccountId)))
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Mot de passe actuel incorrect' });
      const newHash = input.newPassword ? await hash(input.newPassword, BCRYPT_ROUNDS) : null;
      await ctx.prisma.$transaction(async (tx) => {
        await lockAdministrators(tx);
        const current = await tx.account.findFirst({
          where: { id: credential.id, providerAccountId: credential.providerAccountId },
          select: { id: true },
        });
        if (!current)
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Le compte a changé. Reconnectez-vous.',
          });
        const duplicate = await tx.user.findFirst({
          where: { email: input.email, id: { not: ctx.user.id } },
          select: { id: true },
        });
        if (duplicate) throw new TRPCError({ code: 'CONFLICT', message: 'Adresse indisponible' });
        await tx.user.update({
          where: { id: ctx.user.id },
          data: { name: input.name, email: input.email, sessionVersion: { increment: 1 } },
        });
        await tx.parent.updateMany({
          where: { userId: ctx.user.id },
          data: { email: input.email },
        });
        await tx.staffMember.updateMany({
          where: { userId: ctx.user.id },
          data: { email: input.email },
        });
        if (newHash)
          await tx.account.update({
            where: { id: credential.id },
            data: { providerAccountId: newHash },
          });
        await tx.verificationToken.deleteMany({ where: { identifier: `password:${ctx.user.id}` } });
        await recordPlatformAudit(tx, ctx.user.id, 'account.updated', ctx.user.id);
      });
      return { success: true };
    }),
  /**
   * Demande de réinitialisation. Réponse identique que le compte existe ou
   * non (pas d'énumération). Scope `auth` : le compte est retrouvé par
   * (espace, email) avant qu'une session n'existe.
   */
  requestReset: publicProcedure
    .input(
      z.discriminatedUnion('portal', [
        z.object({
          portal: z.literal('standard'),
          organization: organizationSlugSchema,
          email: z.string().email().toLowerCase(),
        }),
        z.object({ portal: z.literal('super-admin'), email: z.string().email().toLowerCase() }),
      ]),
    )
    .mutation(async ({ ctx, input }) => {
      if (!(await isEmailConfigured()) || !process.env.AUTH_URL)
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'La récupération par email est indisponible. Contactez le secrétariat.',
        });
      const space = input.portal === 'super-admin' ? 'platform' : input.organization;
      if (!(await consumeLoginAttempt(`reset:${space}:${input.email}`, ctx.clientIp)))
        return { success: true };
      const token = randomBytes(32).toString('hex');
      const recipient = await withDbContext({ scope: 'auth' }, async (db) => {
        const organization = await db.organization.findFirst({
          where:
            input.portal === 'super-admin'
              ? { kind: 'PLATFORM' }
              : { slug: input.organization, kind: 'TENANT', status: 'ACTIVE' },
          select: { id: true },
        });
        if (!organization) return null;
        const user = await db.user.findFirst({
          where: { organizationId: organization.id, email: input.email },
          select: { id: true, email: true, disabledAt: true, organizationId: true },
        });
        if (!user || user.disabledAt) return null;
        await lockAdministrators(db);
        await db.verificationToken.deleteMany({ where: { identifier: `password:${user.id}` } });
        await db.verificationToken.create({
          data: {
            identifier: `password:${user.id}`,
            token: digest(token),
            expires: new Date(Date.now() + 30 * 60_000),
          },
        });
        return user;
      });
      if (!recipient) return { success: true };
      const url = new URL('/auth/reset-password', process.env.AUTH_URL);
      url.searchParams.set('token', token);
      const branding = await getBranding();
      const sender = await withDbContext(
        { scope: 'tenant', organizationId: recipient.organizationId },
        (db) => getEmailSender(db),
      );
      await sendEmail(
        {
          to: recipient.email,
          subject: `Réinitialiser votre mot de passe ${branding.name}`,
          text: `Lien valable 30 minutes : ${url}`,
          html: `<p><a href="${escapeHtml(url.toString())}">Réinitialiser mon mot de passe</a> (30 minutes)</p>`,
        },
        sender,
      );
      return { success: true };
    }),
  reset: publicProcedure
    .input(z.object({ token: z.string().regex(/^[0-9a-f]{64}$/), password }))
    .mutation(async ({ input }) => {
      const hashed = await hash(input.password, BCRYPT_ROUNDS);
      await withDbContext({ scope: 'auth' }, async (tx) => {
        const token = await tx.verificationToken.findUnique({
          where: { token: digest(input.token) },
          select: { token: true, identifier: true, expires: true },
        });
        if (!token || !token.identifier.startsWith('password:') || token.expires <= new Date())
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Lien expiré ou déjà utilisé' });
        const userId = token.identifier.slice(9);
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { disabledAt: true, organizationId: true },
        });
        if (!user || user.disabledAt)
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Lien invalide' });
        await lockAdministrators(tx);
        await tx.verificationToken.delete({ where: { token: token.token } });
        const account = await tx.account.findFirst({
          where: { userId, provider: 'credentials' },
          select: { id: true },
        });
        if (account)
          await tx.account.update({
            where: { id: account.id },
            data: { providerAccountId: hashed },
          });
        else
          await tx.account.create({
            data: {
              userId,
              type: 'credentials',
              provider: 'credentials',
              providerAccountId: hashed,
            },
          });
        await tx.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
        await recordPlatformAudit(
          tx,
          userId,
          'account.password_reset',
          userId,
          'SUCCESS',
          user.organizationId,
        );
      });
      return { success: true };
    }),
});
