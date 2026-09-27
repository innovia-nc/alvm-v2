/**
 * Jeu de données complet d'une association, écrit par le VRAI code (tRPC,
 * services) sous la RLS du tenant : une ligne au moins dans chaque table
 * métier. Les rares tables sans procédure d'écriture (documents téléversés,
 * suivi d'emails, sessions NextAuth) sont remplies par le client applicatif
 * dans la transaction du tenant — donc toujours soumises à ses policies.
 */
import { hash } from 'bcryptjs';
import type { TestTenant } from './tenants';
import {
  createChild,
  createParent,
  createPublishedCamp,
  createStaff,
  isoDay,
  uniqueSuffix,
} from './tenants';
import { inAuth, inTenant } from './db';

export interface TenantDataset {
  tenant: TestTenant;
  parentId: string;
  parentEmail: string;
  childId: string;
  staffId: string;
  campId: string;
  registrationId: string;
  invoiceId: string;
  secondInvoiceId: string;
  paymentId: string;
  refundId: string;
  creditNoteId: string;
  childDocumentId: string;
  staffDocumentId: string;
}

export async function seedTenantDataset(tenant: TestTenant): Promise<TenantDataset> {
  const admin = tenant.adminCaller;
  const parent = await createParent(tenant);
  const child = await createChild(tenant, parent.id);
  const staff = await createStaff(tenant);
  const { camp } = await createPublishedCamp(tenant);

  const registration = await admin.registrations.createByStaff({
    campId: camp.id,
    childId: child.id,
    parentId: parent.id,
    status: 'CONFIRMED',
  });
  await admin.attendances.markAttendance({
    registrationId: registration.id,
    date: isoDay(30),
    status: 'PRESENT',
  });

  // Facture émise (écritures VE), réglée par chèque (écritures BQ).
  const invoice = await admin.invoices.createFromRegistration({
    registrationId: registration.id,
    status: 'SENT',
  });
  const methods = await admin.paymentMethods.list();
  const check = methods.find((method) => method.code === 'CHECK');
  if (!check) throw new Error('Moyen de paiement CHECK absent du provisionnement.');
  const payment = await admin.payments.create({
    invoiceId: invoice.id,
    amount: 25000,
    paymentDate: isoDay(0),
    paymentMethodId: check.id,
    reference: 'CHQ-IT-1',
  });

  // Remboursement en crédit futur : avoir + crédit parent.
  const refund = await admin.refunds.create({
    paymentId: payment.id,
    amount: 5000,
    refundDate: isoDay(0),
    refundMethod: 'FUTURE_CREDIT',
    reason: 'Journée annulée par la famille',
  });
  const { creditNoteId } = await inTenant(tenant.organization.id, (db) =>
    db.refund.findUniqueOrThrow({ where: { id: refund.id }, select: { creditNoteId: true } }),
  );
  if (!creditNoteId) throw new Error('Le remboursement FUTURE_CREDIT doit créer un avoir.');

  // Seconde facture : l'avoir y est imputé automatiquement à l'émission
  // (credit_applications, credit_note_allocations, paiement CREDIT_NOTE).
  const second = await admin.invoices.create({
    parentId: parent.id,
    dueDate: isoDay(30),
    lines: [
      { registrationId: null, description: 'Adhésion annuelle', quantity: 1, unitPrice: 3000 },
    ],
  });
  await admin.invoices.validate({ id: second.id });

  await admin.fec.generateFEC({ startDate: isoDay(-400), endDate: isoDay(400) });

  // Tables sans procédure d'écriture : client applicatif, transaction du tenant.
  const documents = await inTenant(tenant.organization.id, async (db) => {
    const childDocument = await db.childDocument.create({
      data: {
        childId: child.id,
        filename: `${uniqueSuffix()}.pdf`,
        originalFilename: 'certificat.pdf',
        fileUrl: `https://store.private.blob.vercel-storage.com/organizations/${tenant.organization.id}/child.pdf`,
        mimeType: 'application/pdf',
        fileSize: 1024,
        uploadedBy: tenant.admin.id,
      },
      select: { id: true },
    });
    const staffDocument = await db.staffDocument.create({
      data: {
        staffId: staff.id,
        filename: `${uniqueSuffix()}.pdf`,
        originalFilename: 'diplome.pdf',
        fileUrl: `https://store.private.blob.vercel-storage.com/organizations/${tenant.organization.id}/staff.pdf`,
        mimeType: 'application/pdf',
        fileSize: 2048,
        uploadedBy: tenant.admin.id,
      },
      select: { id: true },
    });
    await db.emailMessage.create({
      data: {
        kind: 'invoice',
        recipient: parent.email,
        subject: 'Votre facture',
        relatedId: invoice.id,
      },
      select: { id: true },
    });
    await db.session.create({
      data: {
        sessionToken: `session-${uniqueSuffix()}`,
        userId: parent.id,
        expires: new Date(Date.now() + 3_600_000),
      },
      select: { id: true },
    });
    return { childDocumentId: childDocument.id, staffDocumentId: staffDocument.id };
  });

  // Jeton de réinitialisation, posé comme `account.requestReset` (scope auth).
  await inAuth((db) =>
    db.verificationToken.create({
      data: {
        identifier: `password:${parent.id}`,
        token: `token-${uniqueSuffix()}`,
        expires: new Date(Date.now() + 1_800_000),
      },
    }),
  );
  // Compte OAuth fictif du parent : une seconde ligne `accounts` pour le tenant.
  await inTenant(tenant.organization.id, async (db) =>
    db.account.create({
      data: {
        userId: parent.id,
        type: 'oauth',
        provider: 'integration-oauth',
        providerAccountId: await hash(uniqueSuffix(), 4),
      },
      select: { id: true },
    }),
  );

  return {
    tenant,
    parentId: parent.id,
    parentEmail: parent.email,
    childId: child.id,
    staffId: staff.id,
    campId: camp.id,
    registrationId: registration.id,
    invoiceId: invoice.id,
    secondInvoiceId: second.id,
    paymentId: payment.id,
    refundId: refund.id,
    creditNoteId,
    ...documents,
  };
}
