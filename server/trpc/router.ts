/**
 * Root tRPC Router.
 *
 * All domain routers are registered here. Routers will be migrated
 * progressively from the original NestJS backend.
 */

import { router, publicProcedure, createCallerFactory } from './init';
import { settingsRouter } from '@/server/routers/settings';
import { campTypesRouter } from '@/server/routers/camp-types';
import { paymentMethodsRouter } from '@/server/routers/payment-methods';
import { staffDocumentsRouter } from '@/server/routers/staff-documents';
import { staffRouter } from '@/server/routers/staff';
import { usersRouter } from '@/server/routers/users';
import { parentsRouter } from '@/server/routers/parents';
import { childDocumentsRouter } from '@/server/routers/child-documents';
import { childrenRouter } from '@/server/routers/children';
import { campsRouter } from '@/server/routers/camps';
import { attendancesRouter } from '@/server/routers/attendances';
import { registrationsRouter } from '@/server/routers/registrations';
import { invoicesRouter } from '@/server/routers/invoices';
import { paymentsRouter } from '@/server/routers/payments';
import { creditNotesRouter } from '@/server/routers/credit-notes';
import { refundsRouter } from '@/server/routers/refunds';
import { fecRouter } from '@/server/routers/fec';

export const appRouter = router({
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
