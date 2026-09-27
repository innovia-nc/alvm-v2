import { z } from 'zod';
import { hash } from 'bcryptjs';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, superAdminProcedure } from '@back/trpc/trpc.init';
import { FEATURES } from '@alvm/shared/features';
import { INTEGRATIONS, type IntegrationId } from '@alvm/shared/platform';
import {
  encryptSecret,
  getBranding,
  getIntegrationSecret,
} from '@back/services/platform-config.service';
import { recordPlatformAudit } from '@back/services/platform-audit.service';
import { lockAdministrators } from '@back/services/account-access.service';
import { BCRYPT_ROUNDS } from '@back/helpers/password';

const integrationId = z.enum(Object.keys(INTEGRATIONS) as [IntegrationId, ...IntegrationId[]]);
const accountSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  disabledAt: true,
  createdAt: true,
  organization: { select: { id: true, name: true, slug: true } },
} as const;
const brandingSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(200),
  supportEmail: z.union([z.literal(''), z.string().email()]),
});

export const platformRouter = router({
  branding: publicProcedure.query(({ ctx }) => getBranding(ctx.prisma)),
  configuration: superAdminProcedure.query(async ({ ctx }) => ({
    branding: await getBranding(ctx.prisma),
    encryptionReady: Buffer.from(process.env.PLATFORM_ENCRYPTION_KEY ?? '', 'base64').length === 32,
    infrastructure: {
      database: Boolean(process.env.DATABASE_URL),
      authentication: Boolean(process.env.AUTH_SECRET),
      publicUrl: process.env.AUTH_URL ?? null,
    },
  })),
  saveBranding: superAdminProcedure.input(brandingSchema).mutation(async ({ ctx, input }) => {
    await ctx.prisma.$transaction(async (tx) => {
      const value = JSON.stringify(input);
      await tx.platformSetting.upsert({
        where: { key: 'branding' },
        create: { key: 'branding', value, updatedBy: ctx.user.id },
        update: { value, updatedBy: ctx.user.id },
      });
      await recordPlatformAudit(tx, ctx.user.id, 'platform.branding.updated', 'branding');
    });
    return { success: true };
  }),
  integrations: superAdminProcedure.query(async ({ ctx }) => {
    const rows = await ctx.prisma.platformIntegration.findMany();
    return Object.entries(INTEGRATIONS).map(([id, definition]) => {
      const row = rows.find((row) => row.id === id);
      const fromEnvironment = Boolean(process.env[definition.environment]);
      return {
        id: id as IntegrationId,
        enabled: row?.enabled ?? fromEnvironment,
        configured: Boolean(row?.encryptedSecret) || fromEnvironment,
        source: row?.encryptedSecret
          ? ('database' as const)
          : fromEnvironment
            ? ('environment' as const)
            : ('missing' as const),
        updatedAt: row?.updatedAt ?? null,
      };
    });
  }),
  saveIntegration: superAdminProcedure
    .input(
      z.object({
        id: integrationId,
        enabled: z.boolean(),
        secret: z.string().trim().min(8).max(4096).optional(),
        removeSecret: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.secret && input.removeSecret)
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Choisissez un remplacement ou une suppression de clé.',
        });
      if (input.removeSecret && input.enabled)
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Désactivez l’intégration pour supprimer sa clé.',
        });
      const encrypted = input.secret ? encryptSecret(input.secret) : undefined;
      await ctx.prisma.$transaction(async (tx) => {
        const current = await tx.platformIntegration.findUnique({ where: { id: input.id } });
        if (
          input.enabled &&
          !encrypted &&
          !current?.encryptedSecret &&
          !process.env[INTEGRATIONS[input.id].environment]
        )
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Renseignez une clé avant d’activer cette intégration.',
          });
        await tx.platformIntegration.upsert({
          where: { id: input.id },
          create: {
            id: input.id,
            enabled: input.enabled,
            encryptedSecret: encrypted,
            updatedBy: ctx.user.id,
          },
          update: {
            enabled: input.enabled,
            encryptedSecret: input.removeSecret ? null : encrypted,
            updatedBy: ctx.user.id,
          },
        });
        await recordPlatformAudit(tx, ctx.user.id, 'platform.integration.updated', input.id);
      });
      return { success: true };
    }),
  checkIntegration: superAdminProcedure
    .input(z.object({ id: integrationId }))
    .mutation(async ({ ctx, input }) => {
      const secret = await getIntegrationSecret(input.id, ctx.prisma);
      if (!secret)
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Intégration désactivée ou sans clé.',
        });
      let connected = false;
      let message = '';
      try {
        if (input.id === 'resend') {
          const response = await fetch('https://api.resend.com/domains', {
            headers: { Authorization: `Bearer ${secret}` },
            signal: AbortSignal.timeout(10000),
            cache: 'no-store',
            redirect: 'error',
          });
          connected = response.ok;
          message = response.ok
            ? 'Connexion Resend vérifiée. Aucun email envoyé.'
            : response.status === 403
              ? 'Lecture des domaines refusée. Une clé limitée à l’envoi peut rester utilisable ; aucun email de test envoyé.'
              : `Resend a refusé la vérification (HTTP ${response.status}).`;
        } else {
          const { list } = await import('@vercel/blob');
          // Discard provider data; no file names or URLs are exposed to the platform operator.
          await list({ token: secret, limit: 1, abortSignal: AbortSignal.timeout(10000) });
          connected = true;
          message = 'Connexion au stockage vérifiée. Aucun fichier modifié.';
        }
      } catch {
        message = 'Connexion impossible. Vérifiez la clé et la disponibilité du fournisseur.';
      }
      await recordPlatformAudit(
        ctx.prisma,
        ctx.user.id,
        'platform.integration.checked',
        input.id,
        connected ? 'SUCCESS' : 'FAILED',
      );
      return { connected, message };
    }),
  accounts: superAdminProcedure
    .input(
      z.object({
        search: z.string().max(100).default(''),
        organizationId: z.string().uuid().optional(),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const where = {
        ...(input.organizationId ? { organizationId: input.organizationId } : {}),
        ...(input.search
          ? {
              OR: [
                { name: { contains: input.search, mode: 'insensitive' as const } },
                { email: { contains: input.search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      };
      const [accounts, total] = await Promise.all([
        ctx.prisma.user.findMany({
          where,
          select: accountSelect,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: input.offset,
          take: input.limit,
        }),
        ctx.prisma.user.count({ where }),
      ]);
      return { accounts, total };
    }),
  createAccount: superAdminProcedure
    .input(
      z.object({
        name: z.string().trim().min(2).max(100),
        email: z.string().email().toLowerCase(),
        role: z.literal('SUPER_ADMIN'),
        password: z.string().min(12).max(128).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const passwordHash = await hash(input.password, BCRYPT_ROUNDS);
      return ctx.prisma.$transaction(async (tx) => {
        await lockAdministrators(tx);
        const platform = await tx.organization.findFirst({
          where: { kind: 'PLATFORM' },
          select: { id: true },
        });
        if (!platform)
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Espace de plateforme absent : initialisez la base (create-super-admin).',
          });
        if (await tx.user.findFirst({ where: { organizationId: platform.id, email: input.email } }))
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Cette adresse possède déjà un compte.',
          });
        const account = await tx.user.create({
          data: {
            organizationId: platform.id,
            name: input.name,
            email: input.email,
            role: input.role,
            accounts: {
              create: {
                type: 'credentials',
                provider: 'credentials',
                providerAccountId: passwordHash,
              },
            },
          },
          select: accountSelect,
        });
        await recordPlatformAudit(tx, ctx.user.id, 'platform.account.created', account.id);
        return account;
      });
    }),
  updateAccount: superAdminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().trim().min(2).max(100),
        email: z.string().email().toLowerCase(),
        disabled: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.id === ctx.user.id)
        throw new TRPCError({
          code: 'FORBIDDEN',
          message:
            'Modifiez votre identité depuis « Mon compte ». Vous ne pouvez pas désactiver votre propre accès.',
        });
      return ctx.prisma.$transaction(async (tx) => {
        await lockAdministrators(tx);
        const current = await tx.user.findUnique({ where: { id: input.id } });
        if (!current) throw new TRPCError({ code: 'NOT_FOUND', message: 'Compte introuvable.' });
        if (current.role !== 'SUPER_ADMIN' && input.email !== current.email)
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'L’adresse de connexion d’un compte métier reste gérée par l’entreprise.',
          });
        if (
          input.disabled &&
          !current.disabledAt &&
          ['ADMIN', 'SUPER_ADMIN'].includes(current.role) &&
          (await tx.user.count({
            where: {
              organizationId: current.organizationId,
              role: current.role,
              disabledAt: null,
            },
          })) <= 1
        )
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Impossible de désactiver le dernier compte actif de ce rôle dans cet espace.',
          });
        if (
          input.email !== current.email &&
          (await tx.user.findFirst({
            where: { organizationId: current.organizationId, email: input.email },
          }))
        )
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Cette adresse possède déjà un compte.',
          });
        const account = await tx.user.update({
          where: { id: input.id },
          data: {
            name: input.name,
            email: input.email,
            disabledAt: input.disabled ? (current.disabledAt ?? new Date()) : null,
            sessionVersion: { increment: 1 },
          },
          select: accountSelect,
        });
        if (input.email !== current.email) {
          await tx.verificationToken.deleteMany({ where: { identifier: `password:${input.id}` } });
        }
        await recordPlatformAudit(tx, ctx.user.id, 'platform.account.updated', input.id);
        return account;
      });
    }),
  revokeSessions: superAdminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.prisma.$transaction(async (tx) => {
        if (!(await tx.user.findUnique({ where: { id: input.id } })))
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Compte introuvable.' });
        await tx.user.update({
          where: { id: input.id },
          data: { sessionVersion: { increment: 1 } },
        });
        await recordPlatformAudit(tx, ctx.user.id, 'platform.account.sessions_revoked', input.id);
      });
      return { success: true };
    }),
  audit: superAdminProcedure
    .input(
      z.object({
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(100).default(30),
        action: z.string().max(100).default(''),
      }),
    )
    .query(async ({ ctx, input }) => {
      const where = input.action ? { action: { contains: input.action } } : {};
      const [events, total] = await Promise.all([
        ctx.prisma.platformAuditLog.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: input.limit,
          skip: input.offset,
        }),
        ctx.prisma.platformAuditLog.count({ where }),
      ]);
      const ids = [
        ...new Set(
          events
            .flatMap((event) => [event.actorId, event.target])
            .filter((value): value is string => Boolean(value && /^[0-9a-f-]{36}$/i.test(value))),
        ),
      ];
      const identities = ids.length
        ? await ctx.prisma.user.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true, email: true },
          })
        : [];
      const names = new Map(
        identities.map((identity) => [identity.id, identity.name || identity.email]),
      );
      const labels: Record<string, string> = {
        branding: 'Identité de l’application',
        SUPER_ADMIN: 'Super admin',
        ADMIN: 'Admin entreprise',
        STAFF: 'Personnel',
        PARENT: 'Parent',
        ...Object.fromEntries(Object.entries(FEATURES).map(([key, value]) => [key, value.label])),
        ...Object.fromEntries(
          Object.entries(INTEGRATIONS).map(([key, value]) => [key, value.label]),
        ),
      };
      return {
        events: events.map((event) => ({
          ...event,
          actorName: event.actorId
            ? (names.get(event.actorId) ?? 'Compte supprimé')
            : 'Non authentifié',
          targetLabel: event.target
            ? (names.get(event.target) ?? labels[event.target] ?? event.target)
            : '—',
        })),
        total,
      };
    }),
});
