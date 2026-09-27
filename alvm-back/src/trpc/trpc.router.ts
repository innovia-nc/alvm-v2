/**
 * Root tRPC Router.
 *
 * All domain routers are registered here. Routers will be migrated
 * progressively from the original NestJS backend.
 */

import { platformRouter } from '@back/trpc/routers/platform';
import { organizationsRouter } from '@back/trpc/routers/organizations';
import { featuresRouter } from '@back/trpc/routers/features';
import { dashboardRouter } from '@back/trpc/routers/dashboard';
import { accountRouter } from '@back/trpc/routers/account';
import { router, publicProcedure, createCallerFactory } from './trpc.init';
import { settingsRouter } from '@back/trpc/routers/settings';
import { campTypesRouter } from '@back/trpc/routers/camp-types';
import { paymentMethodsRouter } from '@back/trpc/routers/payment-methods';
import { staffDocumentsRouter } from '@back/trpc/routers/staff-documents';
import { staffRouter } from '@back/trpc/routers/staff';
import { usersRouter } from '@back/trpc/routers/users';
import { parentsRouter } from '@back/trpc/routers/parents';
import { childDocumentsRouter } from '@back/trpc/routers/child-documents';
import { childrenRouter } from '@back/trpc/routers/children';
import { campsRouter } from '@back/trpc/routers/camps';
import { attendancesRouter } from '@back/trpc/routers/attendances';
import { registrationsRouter } from '@back/trpc/routers/registrations';
import { invoicesRouter } from '@back/trpc/routers/invoices';
import { paymentsRouter } from '@back/trpc/routers/payments';
import { creditNotesRouter } from '@back/trpc/routers/credit-notes';
import { refundsRouter } from '@back/trpc/routers/refunds';
import { fecRouter } from '@back/trpc/routers/fec';

export const appRouter = router({
  platform: platformRouter,
  organizations: organizationsRouter,
  features: featuresRouter,
  account: accountRouter,
  dashboard: dashboardRouter,
  health: publicProcedure.query(() => ({
    status: 'ok' as const,
    timestamp: new Date().toISOString(),
  })),

  // --- Lot 1 : CRUD simples ---
  settings: settingsRouter,
  campTypes: campTypesRouter,
  paymentMethods: paymentMethodsRouter,
  staff: staffRouter,
  staffDocuments: staffDocumentsRouter,

  // --- Lot 2 : users, parents, childDocuments ---
  // (le routeur `auth` a été retiré : NextAuth porte la session et le profil,
  //  `users.resetPassword` le mot de passe, `parents.delete` la suppression.)
  users: usersRouter,
  parents: parentsRouter,
  childDocuments: childDocumentsRouter,

  // --- Lot 3 : children, camps, attendances ---
  children: childrenRouter,
  camps: campsRouter,
  attendances: attendancesRouter,

  // --- Lot 4 : registrations ---
  registrations: registrationsRouter,

  // --- Lot 5 : facturation ---
  invoices: invoicesRouter,
  payments: paymentsRouter,
  creditNotes: creditNotesRouter,
  refunds: refundsRouter,
  fec: fecRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
