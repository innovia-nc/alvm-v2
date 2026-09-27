/**
 * Flux métier multi-tenant par les VRAIES procédures tRPC, sur une vraie base
 * sous RLS (rôle applicatif non-superuser).
 *
 * Reprend l'ancienne campagne smoke (`test/e2e-smoke/smoke.mjs`, retirée par
 * la refonte) : camp → inscription → facture → paiements → remboursement →
 * avoir → imputation automatique → FEC, avec les invariants comptables
 * vérifiés en base. Puis les règles d'accès entre associations et la super
 * administration (provisionnement, modules, audit).
 *
 * Les étapes d'un même `describe` s'enchaînent (scénario) : un échec rend les
 * suivantes non significatives — lire le premier échec.
 */
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isSessionValid, verifyCredentials } from '@back/services/auth.service';
import { SYSTEM_PAYMENT_METHODS } from '@back/services/tenant-defaults';
import { createOwnerClient, trpcCodeOf } from './helpers/db';
import {
  callerFor,
  createChild,
  createParent,
  createPublishedCamp,
  createSuperAdmin,
  isoDay,
  provisionTenant,
  TEST_PASSWORD,
  uniqueSuffix,
  type TestParent,
  type TestTenant,
} from './helpers/tenants';

const YEAR = new Date().getFullYear();

let owner: PrismaClient;
let superAdmin: Awaited<ReturnType<typeof createSuperAdmin>>;

beforeAll(async () => {
  owner = createOwnerClient();
  superAdmin = await createSuperAdmin();
});

afterAll(async () => {
  await owner?.$disconnect();
});

// ---------------------------------------------------------------------------
// Vues de contrôle (propriétaire, hors RLS) : invariants comptables par tenant
// ---------------------------------------------------------------------------

/** Écritures (par numéro d'écriture) dont Σ débit ≠ Σ crédit. */
async function unbalancedEntries(organizationId: string) {
  return owner.$queryRaw<Array<{ entry_num: string }>>`
    SELECT entry_num FROM accounting_entries
    WHERE organization_id = ${organizationId}::uuid AND is_cancelled = false
    GROUP BY entry_num HAVING sum(debit) <> sum(credit)`;
}

/** Pièces (facture, avoir) dont Σ débit ≠ Σ crédit, tous journaux confondus. */
async function unbalancedPieces(organizationId: string) {
  return owner.$queryRaw<Array<{ piece_ref: string }>>`
    SELECT piece_ref FROM accounting_entries
    WHERE organization_id = ${organizationId}::uuid AND is_cancelled = false
    GROUP BY piece_ref HAVING sum(debit) <> sum(credit)`;
}

async function ledgerTotals(organizationId: string) {
  const [row] = await owner.$queryRaw<Array<{ d: unknown; c: unknown; zeros: bigint }>>`
    SELECT COALESCE(sum(debit), 0) AS d, COALESCE(sum(credit), 0) AS c,
           count(*) FILTER (WHERE debit = 0 AND credit = 0) AS zeros
    FROM accounting_entries WHERE organization_id = ${organizationId}::uuid AND is_cancelled = false`;
  return { debit: Number(row.d), credit: Number(row.c), zeros: Number(row.zeros) };
}

/** Lignes d'écriture d'une facture/avoir, par journal. */
async function entriesOf(filter: {
  invoiceId?: string;
  creditNoteId?: string;
  paymentId?: string;
}) {
  const rows = await owner.accountingEntry.findMany({
    where: { ...filter, isCancelled: false },
    orderBy: [{ entryNum: 'asc' }, { debit: 'desc' }],
    select: {
      journalCode: true,
      accountNumber: true,
      debit: true,
      credit: true,
      compteAuxNum: true,
    },
  });
  return rows.map((r) => ({
    journal: r.journalCode,
    account: r.accountNumber,
    debit: Number(r.debit),
    credit: Number(r.credit),
    aux: r.compteAuxNum,
  }));
}

/** Solde créditeur du compte 4191 (avoirs à imputer) du tenant. */
async function balance4191(organizationId: string) {
  const [row] = await owner.$queryRaw<Array<{ solde: unknown }>>`
    SELECT COALESCE(sum(credit) - sum(debit), 0) AS solde FROM accounting_entries
    WHERE organization_id = ${organizationId}::uuid AND account_number = '4191' AND is_cancelled = false`;
  return Number(row.solde);
}

async function registrationPaymentStatus(registrationId: string) {
  return (await owner.registration.findUniqueOrThrow({ where: { id: registrationId } }))
    .paymentStatus;
}

const auxOf = (parentId: string) => 'AUX' + parentId.replace(/-/g, '').slice(0, 8);

// ---------------------------------------------------------------------------

describe('numérotation des pièces indépendante par association', () => {
  let A: TestTenant;
  let B: TestTenant;

  async function invoiceForNewRegistration(tenant: TestTenant) {
    const parent = await createParent(tenant);
    const child = await createChild(tenant, parent.id);
    const { camp } = await createPublishedCamp(tenant);
    const registration = await tenant.adminCaller.registrations.createByStaff({
      campId: camp.id,
      childId: child.id,
      parentId: parent.id,
    });
    const invoice = await tenant.adminCaller.invoices.createFromRegistration({
      registrationId: registration.id,
    });
    return { parent, invoice };
  }

  beforeAll(async () => {
    A = await provisionTenant(superAdmin, 'num-a');
    B = await provisionTenant(superAdmin, 'num-b');
  });

  it('chaque association commence à FAC-AAAA-0001', async () => {
    const inA = await invoiceForNewRegistration(A);
    const inB = await invoiceForNewRegistration(B);
    expect(inA.invoice.invoiceNumber).toBe(`FAC-${YEAR}-0001`);
    expect(inB.invoice.invoiceNumber).toBe(`FAC-${YEAR}-0001`);
  });

  it('des créations concurrentes dans une association donnent des numéros distincts et contigus', async () => {
    const parent = await createParent(A);
    const created = await Promise.all(
      [1, 2, 3].map((n) =>
        A.adminCaller.invoices.create({
          parentId: parent.id,
          dueDate: isoDay(30),
          lines: [
            { registrationId: null, description: `Ligne ${n}`, quantity: 1, unitPrice: 1000 },
          ],
        }),
      ),
    );
    expect(created.map((i) => i.invoiceNumber).sort()).toEqual([
      `FAC-${YEAR}-0002`,
      `FAC-${YEAR}-0003`,
      `FAC-${YEAR}-0004`,
    ]);
    // B n'a pas été affectée par les créations de A.
    const next = await invoiceForNewRegistration(B);
    expect(next.invoice.invoiceNumber).toBe(`FAC-${YEAR}-0002`);
  });

  it('les compteurs vivent par association (document_counters)', async () => {
    const counters = await owner.documentCounter.findMany({
      where: { organizationId: { in: [A.organization.id, B.organization.id] }, kind: 'INVOICE' },
      select: { organizationId: true, value: true },
    });
    expect(Object.fromEntries(counters.map((c) => [c.organizationId, Number(c.value)]))).toEqual({
      [A.organization.id]: 4,
      [B.organization.id]: 2,
    });
  });

  it('les avoirs ont leur propre séquence, elle aussi par association', async () => {
    const [cnA, cnB] = await Promise.all(
      [A, B].map(async (tenant) => {
        const parent = await createParent(tenant);
        return tenant.adminCaller.creditNotes.create({
          parentId: parent.id,
          refundMethod: 'FUTURE_CREDIT',
          reason: 'Geste commercial de test',
          lines: [{ registrationId: null, description: 'Geste', quantity: 1, unitPrice: 500 }],
        });
      }),
    );
    expect(cnA.creditNoteNumber).toBe(`AVO-${YEAR}-0001`);
    expect(cnB.creditNoteNumber).toBe(`AVO-${YEAR}-0001`);
  });
});

describe('flux métier complet (ex-campagne smoke) sous RLS', () => {
  let F: TestTenant;
  let other: TestTenant;
  let parent: TestParent;
  let childId: string;
  let campId: string;
  let registrationId: string;
  let invoiceId: string;
  let methods: Record<string, string>;
  let p1: string;
  let creditNoteId: string;
  let secondInvoiceId: string;
  let thirdInvoiceId: string;
  let manualCreditNoteId: string;
  let manualPaymentId: string;

  beforeAll(async () => {
    F = await provisionTenant(superAdmin, 'flux');
    // Une seconde association active en parallèle : rien d'elle ne doit
    // apparaître dans les écritures, le FEC ou les listes de F.
    other = await provisionTenant(superAdmin, 'flux-autre');
    const otherParent = await createParent(other);
    const otherChild = await createChild(other, otherParent.id);
    const { camp } = await createPublishedCamp(other);
    const otherRegistration = await other.adminCaller.registrations.createByStaff({
      campId: camp.id,
      childId: otherChild.id,
      parentId: otherParent.id,
    });
    await other.adminCaller.invoices.createFromRegistration({
      registrationId: otherRegistration.id,
      status: 'SENT',
    });
  });

  it('parents : création par le personnel, connexion du parent créé, code postal invalide refusé', async () => {
    parent = await createParent(F);
    const login = await verifyCredentials(
      {
        portal: 'standard',
        organization: F.organization.slug,
        email: parent.email,
        password: TEST_PASSWORD,
      },
      '192.0.2.10',
    );
    expect(login).toMatchObject({
      id: parent.id,
      role: 'PARENT',
      organizationId: F.organization.id,
    });

    // Mauvais espace : le même compte n'existe pas chez l'autre association.
    expect(
      await verifyCredentials(
        {
          portal: 'standard',
          organization: other.organization.slug,
          email: parent.email,
          password: TEST_PASSWORD,
        },
        '192.0.2.10',
      ),
    ).toBeNull();
    expect(
      await trpcCodeOf(
        F.adminCaller.parents.create({
          firstName: 'Code',
          lastName: 'Postal',
          email: `cp-${uniqueSuffix()}@famille.test`,
          phone: '687001001',
          postalCode: 'ABC',
        }),
      ),
    ).toBe('BAD_REQUEST');
  });

  it('enfants : création liée au parent ; le parent ne voit que les siens', async () => {
    const child = await createChild(F, parent.id);
    childId = child.id;
    expect(child.parents.map((p) => p.parentId)).toEqual([parent.id]);
    expect(
      await trpcCodeOf(
        F.adminCaller.children.create({
          firstName: 'Futur',
          lastName: 'Enfant',
          birthDate: `${YEAR + 1}-01-01T00:00:00.000Z`,
          gender: 'MALE',
          parents: [{ parentId: parent.id, isPrimary: true }],
        }),
      ),
    ).toBe('BAD_REQUEST');
    const seen = await parent.caller.children.list({ limit: 10, offset: 0 });
    expect(seen.children.map((c) => c.id)).toEqual([childId]);
  });

  it('camp : 5 jours à 25 000 XPF → 5 000 XPF / jour, 5 journées créées', async () => {
    const { camp } = await createPublishedCamp(F, { maxCapacity: 2 });
    campId = camp.id;
    expect(camp.pricePerDay).toBe(5000);
    expect(await owner.campDay.count({ where: { campId } })).toBe(5);
  });

  it('inscription par le parent ; doublon et enfant étranger refusés', async () => {
    const registration = await parent.caller.registrations.create({ campId, childId });
    registrationId = registration.id;
    expect(registration.status).toBe('PENDING');
    expect(registration.parentId).toBe(parent.id);
    expect(await trpcCodeOf(parent.caller.registrations.create({ campId, childId }))).toBe(
      'CONFLICT',
    );
    expect(
      await trpcCodeOf(
        parent.caller.registrations.create({
          campId,
          childId: '00000000-0000-4000-a000-000000000000',
        }),
      ),
    ).toBe('NOT_FOUND');
  });

  it('facture depuis l’inscription : 25 000 XPF, TGC 0 (LP 492)', async () => {
    const invoice = await F.adminCaller.invoices.createFromRegistration({ registrationId });
    invoiceId = invoice.id;
    expect(invoice).toMatchObject({
      status: 'DRAFT',
      subtotalHt: 25000,
      taxAmount: 0,
      totalAmount: 25000,
      paidAmount: 0,
    });
    expect(await entriesOf({ invoiceId })).toEqual([]);
  });

  it('validation DRAFT → SENT : écritures VE équilibrées, revalidation refusée', async () => {
    const validated = await F.adminCaller.invoices.validate({ id: invoiceId });
    expect(validated.status).toBe('SENT');
    expect(await trpcCodeOf(F.adminCaller.invoices.validate({ id: invoiceId }))).toBe(
      'PRECONDITION_FAILED',
    );
    expect(await entriesOf({ invoiceId })).toEqual([
      { journal: 'VE', account: '411000', debit: 25000, credit: 0, aux: auxOf(parent.id) },
      { journal: 'VE', account: '706100', debit: 0, credit: 25000, aux: null },
    ]);
    expect(await registrationPaymentStatus(registrationId)).toBe('UNPAID');
  });

  it('paiements : surpaiement refusé, partiel puis solde → PAID (trigger payment_status)', async () => {
    const list = await F.adminCaller.paymentMethods.list();
    methods = Object.fromEntries(list.map((m) => [m.code, m.id]));
    expect(Object.keys(methods).sort()).toEqual(SYSTEM_PAYMENT_METHODS.map((m) => m.code).sort());

    expect(
      await trpcCodeOf(
        F.adminCaller.payments.create({
          invoiceId,
          amount: 999999,
          paymentDate: isoDay(0),
          paymentMethodId: methods.CHECK,
        }),
      ),
    ).toBe('BAD_REQUEST');

    const first = await F.adminCaller.payments.create({
      invoiceId,
      amount: 10000,
      paymentDate: isoDay(0),
      paymentMethodId: methods.CHECK,
      reference: 'CHQ-IT-1',
    });
    p1 = first.id;
    expect(await registrationPaymentStatus(registrationId)).toBe('PARTIAL');
    expect(await entriesOf({ paymentId: p1 })).toEqual([
      { journal: 'BQ', account: '511200', debit: 10000, credit: 0, aux: null },
      { journal: 'BQ', account: '411000', debit: 0, credit: 10000, aux: auxOf(parent.id) },
    ]);

    await F.adminCaller.payments.create({
      invoiceId,
      amount: 15000,
      paymentDate: isoDay(0),
      paymentMethodId: methods.CASH,
    });
    const invoice = await F.adminCaller.invoices.getById({ id: invoiceId });
    expect(invoice).toMatchObject({ status: 'PAID', paidAmount: 25000, remainingAmount: 0 });
    expect(await registrationPaymentStatus(registrationId)).toBe('PAID');
  });

  it('paiement sur une facture en brouillon refusé', async () => {
    const draft = await F.adminCaller.invoices.create({
      parentId: parent.id,
      dueDate: isoDay(30),
      lines: [{ registrationId: null, description: 'Ligne libre', quantity: 1, unitPrice: 1000 }],
    });
    expect(
      await trpcCodeOf(
        F.adminCaller.payments.create({
          invoiceId: draft.id,
          amount: 500,
          paymentDate: isoDay(0),
          paymentMethodId: methods.CASH,
        }),
      ),
    ).toBe('PRECONDITION_FAILED');
    await F.adminCaller.invoices.delete({ id: draft.id });
  });

  it('remboursement immédiat partiel : payé recalculé, écritures BQ inverses, statut PARTIAL', async () => {
    const refund = await F.adminCaller.refunds.create({
      paymentId: p1,
      amount: 5000,
      refundDate: isoDay(0),
      refundMethod: 'IMMEDIATE_REFUND',
      reason: 'Remboursement partiel',
    });
    expect(
      await trpcCodeOf(
        F.adminCaller.refunds.create({
          paymentId: p1,
          amount: 6000,
          refundDate: isoDay(0),
          refundMethod: 'IMMEDIATE_REFUND',
          reason: 'Au-delà du paiement',
        }),
      ),
    ).toBe('BAD_REQUEST');
    const invoice = await F.adminCaller.invoices.getById({ id: invoiceId });
    expect(invoice).toMatchObject({ status: 'SENT', paidAmount: 20000 });
    expect(await registrationPaymentStatus(registrationId)).toBe('PARTIAL');
    const refundEntries = await owner.accountingEntry.findMany({
      where: { refundId: refund.id },
      orderBy: { debit: 'desc' },
      select: { accountNumber: true, debit: true, credit: true },
    });
    expect(refundEntries.map((e) => [e.accountNumber, Number(e.debit), Number(e.credit)])).toEqual([
      ['411000', 5000, 0],
      ['511200', 0, 5000],
    ]);
  });

  it('avoir en crédit futur : écritures D 706 / C 4191 et crédit parent disponible', async () => {
    const creditNote = await F.adminCaller.creditNotes.create({
      creditedInvoiceId: invoiceId,
      parentId: parent.id,
      refundMethod: 'FUTURE_CREDIT',
      reason: 'Avoir de test de la campagne',
      lines: [{ registrationId: null, description: 'Avoir partiel', quantity: 1, unitPrice: 3000 }],
    });
    creditNoteId = creditNote.id;
    await F.adminCaller.creditNotes.updateStatus({ id: creditNoteId, status: 'SENT' });
    expect(await entriesOf({ creditNoteId })).toEqual([
      { journal: 'VE', account: '706000', debit: 3000, credit: 0, aux: null },
      { journal: 'VE', account: '4191', debit: 0, credit: 3000, aux: auxOf(parent.id) },
    ]);
    const credits = await parent.caller.registrations.getAvailableCredits({ parentId: parent.id });
    expect(credits.totalAvailable).toBe(3000);
    expect(
      await trpcCodeOf(parent.caller.registrations.getAvailableCredits({ parentId: F.admin.id })),
    ).toBe('FORBIDDEN');
  });

  it('imputation automatique FIFO à l’émission : D 4191 / C 411000, deux vues du solde à jour (TD-003)', async () => {
    const second = await F.adminCaller.invoices.create({
      parentId: parent.id,
      dueDate: isoDay(30),
      lines: [{ registrationId: null, description: 'Sortie', quantity: 1, unitPrice: 2000 }],
    });
    secondInvoiceId = second.id;
    const issued = await F.adminCaller.invoices.validate({ id: secondInvoiceId });
    expect(issued).toMatchObject({ status: 'PAID', paidAmount: 2000 });

    const credit = await owner.parentCredit.findUniqueOrThrow({ where: { creditNoteId } });
    expect(Number(credit.amountRemaining)).toBe(1000);
    const allocations = await owner.creditNoteAllocation.findMany({ where: { creditNoteId } });
    expect(allocations.map((a) => [a.appliedToInvoiceId, Number(a.amount)])).toEqual([
      [secondInvoiceId, 2000],
    ]);
    const applications = await owner.creditApplication.findMany({
      where: { parentCreditId: credit.id },
    });
    expect(applications.map((a) => [a.invoiceId, Number(a.amountUsed)])).toEqual([
      [secondInvoiceId, 2000],
    ]);
    const payment = await owner.payment.findFirstOrThrow({
      where: { invoiceId: secondInvoiceId },
      include: { paymentMethod: { select: { code: true } } },
    });
    expect(payment.paymentMethod.code).toBe('CREDIT_NOTE');
    expect(payment.creditNoteId).toBe(creditNoteId);
    expect(await entriesOf({ paymentId: payment.id })).toEqual([
      { journal: 'BQ', account: '4191', debit: 2000, credit: 0, aux: null },
      { journal: 'BQ', account: '411000', debit: 0, credit: 2000, aux: auxOf(parent.id) },
    ]);
  });

  it('imputation partielle : le reliquat de l’avoir couvre une partie de la facture suivante', async () => {
    const third = await F.adminCaller.invoices.create({
      parentId: parent.id,
      dueDate: isoDay(30),
      lines: [{ registrationId: null, description: 'Stage', quantity: 1, unitPrice: 4000 }],
    });
    thirdInvoiceId = third.id;
    const issued = await F.adminCaller.invoices.validate({ id: thirdInvoiceId });
    expect(issued).toMatchObject({ status: 'SENT', paidAmount: 1000 });
    const credit = await owner.parentCredit.findUniqueOrThrow({ where: { creditNoteId } });
    expect(Number(credit.amountRemaining)).toBe(0);
    const [{ total }] = await owner.$queryRaw<Array<{ total: unknown }>>`
      SELECT sum(amount) AS total FROM credit_note_allocations WHERE credit_note_id = ${creditNoteId}::uuid`;
    // TD-003 : Σ allocations = montant initial − reste (les deux vues concordent).
    expect(Number(total)).toBe(Number(credit.amountOriginal) - Number(credit.amountRemaining));
  });

  it('imputation manuelle puis suppression du règlement : le crédit est restitué et réimputable une seule fois', async () => {
    const manual = await F.adminCaller.creditNotes.create({
      parentId: parent.id,
      refundMethod: 'FUTURE_CREDIT',
      reason: 'Second avoir de la campagne',
      lines: [{ registrationId: null, description: 'Geste', quantity: 1, unitPrice: 1500 }],
    });
    manualCreditNoteId = manual.id;
    await F.adminCaller.creditNotes.updateStatus({ id: manualCreditNoteId, status: 'SENT' });

    const payment = await F.adminCaller.payments.create({
      invoiceId: thirdInvoiceId,
      amount: 1500,
      paymentDate: isoDay(0),
      paymentMethodId: methods.CREDIT_NOTE,
      creditNoteId: manualCreditNoteId,
    });
    manualPaymentId = payment.id;
    const consumed = await owner.parentCredit.findUniqueOrThrow({
      where: { creditNoteId: manualCreditNoteId },
    });
    expect(Number(consumed.amountRemaining)).toBe(0);
    expect(
      Number(
        (
          await owner.creditNoteAllocation.findFirstOrThrow({
            where: { creditNoteId: manualCreditNoteId },
          })
        ).amount,
      ),
    ).toBe(1500);

    await F.adminCaller.payments.delete({ id: manualPaymentId });
    const restored = await owner.parentCredit.findUniqueOrThrow({
      where: { creditNoteId: manualCreditNoteId },
    });
    expect(Number(restored.amountRemaining)).toBe(1500);
    expect(
      await owner.creditNoteAllocation.count({ where: { creditNoteId: manualCreditNoteId } }),
    ).toBe(0);
    expect(await owner.creditApplication.count({ where: { parentCreditId: restored.id } })).toBe(0);
    expect((await F.adminCaller.invoices.getById({ id: thirdInvoiceId }))?.paidAmount).toBe(1000);

    // Le crédit restitué finance la facture suivante, à hauteur de son solde.
    const fourth = await F.adminCaller.invoices.create({
      parentId: parent.id,
      dueDate: isoDay(30),
      lines: [{ registrationId: null, description: 'Repas', quantity: 1, unitPrice: 1000 }],
    });
    expect(await F.adminCaller.invoices.validate({ id: fourth.id })).toMatchObject({
      status: 'PAID',
      paidAmount: 1000,
    });
    const after = await owner.parentCredit.findUniqueOrThrow({
      where: { creditNoteId: manualCreditNoteId },
    });
    expect(Number(after.amountRemaining)).toBe(500);
  });

  it('compte 4191 : solde créditeur = Σ crédits parents restants', async () => {
    const remaining = await owner.parentCredit.aggregate({
      where: { organizationId: F.organization.id },
      _sum: { amountRemaining: true },
    });
    expect(await balance4191(F.organization.id)).toBe(Number(remaining._sum.amountRemaining));
    expect(await balance4191(F.organization.id)).toBe(500);
  });

  it('confirmation de l’inscription et pointage de présence', async () => {
    const confirmed = await F.adminCaller.registrations.updateStatus({
      id: registrationId,
      status: 'CONFIRMED',
    });
    expect(confirmed.status).toBe('CONFIRMED');
    const attendance = await F.adminCaller.attendances.markAttendance({
      registrationId,
      date: isoDay(30),
      status: 'PRESENT',
    });
    expect(attendance.status).toBe('PRESENT');
  });

  it('export FEC : toutes les écritures de l’association et seulement elles, équilibré', async () => {
    const fec = await F.adminCaller.fec.generateFEC({
      startDate: `${YEAR}-01-01`,
      endDate: `${YEAR}-12-31`,
    });
    const lines = fec.content.trim().split('\n');
    const expected = await owner.accountingEntry.count({
      where: { organizationId: F.organization.id, isCancelled: false },
    });
    expect(fec.entryCount).toBe(expected);
    expect(lines).toHaveLength(expected + 1);
    expect(lines[0].split('|')).toHaveLength(18);
    expect(fec.totalDebit).toBe(fec.totalCredit);
    expect(fec.balance).toBe(0);
    expect(fec.filename).toBe(`FEC_${YEAR}0101_${YEAR}1231.txt`);

    // Aucune écriture de l'autre association (compte auxiliaire de ses clients).
    const otherAux = await owner.accountingEntry.findMany({
      where: { organizationId: other.organization.id, compteAuxNum: { not: null } },
      select: { compteAuxNum: true },
    });
    expect(otherAux.length).toBeGreaterThan(0);
    for (const { compteAuxNum } of otherAux) expect(fec.content).not.toContain(compteAuxNum);

    const named = await F.adminCaller.fec.generateFEC({
      startDate: `${YEAR}-01-01`,
      endDate: `${YEAR}-12-31`,
      siren: '123 456 789',
    });
    expect(named.filename).toBe(`123456789FEC${YEAR}1231.txt`);
    expect(
      await trpcCodeOf(
        F.adminCaller.fec.generateFEC({
          startDate: `${YEAR}-01-01`,
          endDate: `${YEAR}-12-31`,
          siren: '1234',
        }),
      ),
    ).toBe('BAD_REQUEST');

    const exports = await owner.fecExport.findMany({
      where: { organizationId: F.organization.id },
      select: { filename: true, entryCount: true },
    });
    expect(exports).toHaveLength(2);
    expect(exports.every((e) => e.entryCount === expected)).toBe(true);
    const unexported = await owner.invoice.count({
      where: {
        organizationId: F.organization.id,
        status: { notIn: ['DRAFT', 'CANCELLED'] },
        accountingExportedAt: null,
        deletedAt: null,
      },
    });
    expect(unexported).toBe(0);
  });

  it('invariants comptables de l’association (vue de contrôle)', async () => {
    const orgId = F.organization.id;
    expect(await unbalancedEntries(orgId)).toEqual([]);
    expect(await unbalancedPieces(orgId)).toEqual([]);
    const totals = await ledgerTotals(orgId);
    expect(totals.debit).toBe(totals.credit);
    expect(totals.zeros).toBe(0);

    // paid_amount = Σ paiements − Σ remboursements, pour chaque facture.
    const drift = await owner.$queryRaw<Array<{ invoice_number: string }>>`
      SELECT i.invoice_number FROM invoices i
      WHERE i.organization_id = ${orgId}::uuid AND i.deleted_at IS NULL AND i.invoice_type = 'INVOICE'
        AND i.paid_amount <> (
          SELECT COALESCE(sum(p.amount), 0) FROM payments p WHERE p.invoice_id = i.id
        ) - (
          SELECT COALESCE(sum(r.amount), 0) FROM refunds r JOIN payments p ON p.id = r.payment_id
          WHERE p.invoice_id = i.id AND r.deleted_at IS NULL
        )`;
    expect(drift).toEqual([]);

    // Statut de paiement des inscriptions dérivé de leur facture (trigger).
    const mismatches = await owner.$queryRaw<Array<{ id: string }>>`
      SELECT r.id FROM registrations r
      JOIN invoice_lines l ON l.registration_id = r.id AND l.deleted_at IS NULL
      JOIN invoices i ON i.id = l.invoice_id AND i.invoice_type = 'INVOICE' AND i.deleted_at IS NULL
      WHERE r.organization_id = ${orgId}::uuid AND r.deleted_at IS NULL AND r.payment_status <> CASE
        WHEN r.status = 'CANCELLED' THEN 'REFUNDED'::payment_status
        WHEN i.status IN ('CANCELLED', 'DRAFT') THEN 'UNPAID'::payment_status
        WHEN i.status = 'CREDITED' THEN 'REFUNDED'::payment_status
        WHEN i.paid_amount >= i.total_amount - i.credited_amount THEN 'PAID'::payment_status
        WHEN i.paid_amount > 0 THEN 'PARTIAL'::payment_status
        ELSE 'UNPAID'::payment_status END`;
    expect(mismatches).toEqual([]);

    // Aucune ligne de F n'a été écrite chez une autre association.
    const crossed = await owner.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*) AS n FROM accounting_entries e JOIN invoices i ON i.id = e.invoice_id
      WHERE e.organization_id <> i.organization_id`;
    expect(Number(crossed[0].n)).toBe(0);
  });
});

describe('accès entre associations', () => {
  let A: TestTenant;
  let B: TestTenant;
  let parentA: TestParent;
  let parentB: TestParent;
  let childA: string;
  let childB: string;
  let registrationA: string;
  let registrationB: string;
  let campA: string;
  let campB: string;
  let invoiceA: string;
  let invoiceB: string;

  async function family(tenant: TestTenant) {
    const parent = await createParent(tenant);
    const child = await createChild(tenant, parent.id);
    const { camp } = await createPublishedCamp(tenant);
    const registration = await parent.caller.registrations.create({
      campId: camp.id,
      childId: child.id,
    });
    const invoice = await tenant.adminCaller.invoices.createFromRegistration({
      registrationId: registration.id,
      status: 'SENT',
    });
    return {
      parent,
      childId: child.id,
      campId: camp.id,
      registrationId: registration.id,
      invoiceId: invoice.id,
    };
  }

  beforeAll(async () => {
    A = await provisionTenant(superAdmin, 'acces-a');
    B = await provisionTenant(superAdmin, 'acces-b');
    const a = await family(A);
    const b = await family(B);
    [parentA, childA, campA, registrationA, invoiceA] = [
      a.parent,
      a.childId,
      a.campId,
      a.registrationId,
      a.invoiceId,
    ];
    [parentB, childB, campB, registrationB, invoiceB] = [
      b.parent,
      b.childId,
      b.campId,
      b.registrationId,
      b.invoiceId,
    ];
  });

  it('un parent de B ne trouve ni l’enfant, ni la facture, ni l’inscription d’un parent de A', async () => {
    expect(await parentB.caller.children.getById({ id: childA })).toBeNull();
    expect(await parentB.caller.invoices.getById({ id: invoiceA })).toBeNull();
    expect(await parentB.caller.registrations.getById({ id: registrationA })).toBeNull();
    expect(
      (await parentB.caller.children.list({ limit: 100, offset: 0 })).children.map((c) => c.id),
    ).toEqual([childB]);
    // Même chemin d'attaque en écriture : aucune cible trouvée.
    expect(
      await trpcCodeOf(parentB.caller.children.update({ id: childA, firstName: 'Piraté' })),
    ).toBe('NOT_FOUND');
    expect(
      await trpcCodeOf(parentB.caller.registrations.requestCancellation({ id: registrationA })),
    ).toBe('NOT_FOUND');
    expect(
      await trpcCodeOf(parentB.caller.registrations.create({ campId: campA, childId: childA })),
    ).toBe('NOT_FOUND');
    // Son propre enfant dans le camp de A : le camp est introuvable.
    expect(
      await trpcCodeOf(parentB.caller.registrations.create({ campId: campA, childId: childB })),
    ).toBe('NOT_FOUND');
    expect(await parentB.caller.camps.getById({ id: campA })).toBeNull();
  });

  it('un parent de A voit bien les siens (contrôle positif)', async () => {
    expect((await parentA.caller.children.getById({ id: childA }))?.id).toBe(childA);
    expect((await parentA.caller.invoices.getById({ id: invoiceA }))?.id).toBe(invoiceA);
  });

  it('l’admin de A ne liste jamais les données de B', async () => {
    const admin = A.adminCaller;
    const idsB = new Set([parentB.id, childB, campB, registrationB, invoiceB, B.admin.id]);
    const listed = [
      ...(await admin.parents.list({ limit: 100, offset: 0, status: 'all' })).parents.map(
        (p) => p.id,
      ),
      ...(await admin.children.list({ limit: 100, offset: 0 })).children.map((c) => c.id),
      ...(await admin.registrations.list({ limit: 100, offset: 0 })).registrations.map((r) => r.id),
      ...(await admin.invoices.list({ limit: 100, offset: 0 })).invoices.map((i) => i.id),
      ...(await admin.camps.list({ limit: 100, offset: 0 })).camps.map((c) => c.id),
      ...(await admin.users.list({ limit: 100, offset: 0 })).users.map((u) => u.id),
    ];
    expect(listed).toEqual(
      expect.arrayContaining([parentA.id, childA, campA, registrationA, invoiceA, A.admin.id]),
    );
    expect(listed.filter((id) => idsB.has(id))).toEqual([]);
    const summary = await admin.dashboard.summary();
    expect(summary.amountDue).toBe(25000);
  });

  it('l’admin de A ne peut agir sur aucune pièce de B', async () => {
    const admin = A.adminCaller;
    expect(await trpcCodeOf(admin.invoices.validate({ id: invoiceB }))).toBe('NOT_FOUND');
    expect(
      await trpcCodeOf(
        admin.registrations.updateStatus({ id: registrationB, status: 'CONFIRMED' }),
      ),
    ).toBe('NOT_FOUND');
    const cash = (await admin.paymentMethods.list()).find((m) => m.code === 'CASH')!;
    expect(
      await trpcCodeOf(
        admin.payments.create({
          invoiceId: invoiceB,
          amount: 100,
          paymentDate: isoDay(0),
          paymentMethodId: cash.id,
        }),
      ),
    ).toBe('NOT_FOUND');
    expect(await trpcCodeOf(admin.children.update({ id: childB, firstName: 'Piraté' }))).toBe(
      'NOT_FOUND',
    );
    expect(
      await trpcCodeOf(admin.parents.updateByStaff({ id: parentB.id, firstName: 'Piraté' })),
    ).toBe('NOT_FOUND');
    // Un moyen de paiement de B ne règle pas une facture de A.
    const cashB = (await B.adminCaller.paymentMethods.list()).find((m) => m.code === 'CASH')!;
    expect(
      await trpcCodeOf(
        admin.payments.create({
          invoiceId: invoiceA,
          amount: 100,
          paymentDate: isoDay(0),
          paymentMethodId: cashB.id,
        }),
      ),
    ).toBe('BAD_REQUEST');
    const invoice = await owner.invoice.findUniqueOrThrow({ where: { id: invoiceB } });
    expect(Number(invoice.paidAmount)).toBe(0);
    expect((await owner.child.findUniqueOrThrow({ where: { id: childB } })).firstName).not.toBe(
      'Piraté',
    );
  });

  it('un export FEC de B est introuvable depuis A', async () => {
    await B.adminCaller.fec.generateFEC({ startDate: `${YEAR}-01-01`, endDate: `${YEAR}-12-31` });
    const [exportB] = await B.adminCaller.fec.history({ offset: 0 });
    expect(await trpcCodeOf(A.adminCaller.fec.downloadExport({ id: exportB.id }))).toBe(
      'NOT_FOUND',
    );
    expect(await A.adminCaller.fec.history({ offset: 0 })).toEqual([]);
  });

  it('procédures authentifiées sans session → UNAUTHORIZED', async () => {
    const anonymous = callerFor(null);
    for (const call of [
      () => anonymous.children.list({ limit: 1, offset: 0 }),
      () => anonymous.invoices.list({ limit: 1, offset: 0 }),
      () => anonymous.parents.list({ limit: 1, offset: 0 }),
      () => anonymous.fec.history({ offset: 0 }),
      () => anonymous.organizations.current(),
      () => anonymous.organizations.list({}),
      () => anonymous.platform.audit({}),
    ])
      expect(await trpcCodeOf(call())).toBe('UNAUTHORIZED');
    // Les procédures publiques restent accessibles, sans donnée métier.
    expect((await anonymous.organizations.publicInfo({ slug: A.organization.slug }))?.name).toBe(
      A.organization.name,
    );
  });

  it('rôles : parent → procédure du personnel, admin → super administration : FORBIDDEN', async () => {
    expect(await trpcCodeOf(parentA.caller.users.list({ limit: 5, offset: 0 }))).toBe('FORBIDDEN');
    expect(await trpcCodeOf(parentA.caller.invoices.validate({ id: invoiceA }))).toBe('FORBIDDEN');
    expect(await trpcCodeOf(A.adminCaller.organizations.list({}))).toBe('FORBIDDEN');
    expect(
      await trpcCodeOf(
        A.adminCaller.features.set({
          organizationId: B.organization.id,
          key: 'fec',
          enabled: false,
        }),
      ),
    ).toBe('FORBIDDEN');
  });

  it('SUPER_ADMIN refusé sur les procédures métier', async () => {
    const platform = callerFor(superAdmin);
    for (const call of [
      () => platform.children.list({ limit: 1, offset: 0 }),
      () => platform.invoices.list({ limit: 1, offset: 0 }),
      () => platform.parents.list({ limit: 1, offset: 0 }),
      () => platform.fec.history({ offset: 0 }),
      () => platform.children.getById({ id: childA }),
      () => platform.organizations.current(),
    ])
      expect(await trpcCodeOf(call())).toBe('FORBIDDEN');
  });

  it('association suspendue : procédures FORBIDDEN, connexion et session refusées, puis réactivation', async () => {
    const C = await provisionTenant(superAdmin, 'suspendue');
    const platform = callerFor(superAdmin);
    const credentials = {
      portal: 'standard' as const,
      organization: C.organization.slug,
      email: C.admin.email,
      password: TEST_PASSWORD,
    };
    const login = await verifyCredentials(credentials, '192.0.2.20');
    expect(login?.id).toBe(C.admin.id);
    const session = { ...C.admin, sessionVersion: login!.sessionVersion };
    expect(await isSessionValid(session)).toBe(true);

    await platform.organizations.setStatus({ id: C.organization.id, status: 'SUSPENDED' });
    expect(await trpcCodeOf(C.adminCaller.children.list({ limit: 1, offset: 0 }))).toBe(
      'FORBIDDEN',
    );
    expect(await trpcCodeOf(C.adminCaller.organizations.current())).toBe('FORBIDDEN');
    expect(await verifyCredentials(credentials, '192.0.2.20')).toBeNull();
    expect(await isSessionValid(session)).toBe(false);
    expect(
      await callerFor(null).organizations.publicInfo({ slug: C.organization.slug }),
    ).toBeNull();
    // Les autres associations ne sont pas affectées.
    expect((await A.adminCaller.children.list({ limit: 1, offset: 0 })).total).toBeGreaterThan(0);

    await platform.organizations.setStatus({ id: C.organization.id, status: 'ACTIVE' });
    expect((await C.adminCaller.children.list({ limit: 1, offset: 0 })).total).toBe(0);
    expect(await isSessionValid(session)).toBe(true);
    const audit = await owner.platformAuditLog.findMany({
      where: { target: C.organization.id, action: { startsWith: 'platform.organization.' } },
      select: { action: true },
    });
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining([
        'platform.organization.suspended',
        'platform.organization.reactivated',
      ]),
    );
  });
});

describe('super administration', () => {
  let A: TestTenant;
  let B: TestTenant;

  beforeAll(async () => {
    A = await provisionTenant(superAdmin, 'sa-a');
    B = await provisionTenant(superAdmin, 'sa-b');
  });

  it('provisionnement par organizations.create : moyens de paiement système, TGC 0, admin, audit', async () => {
    const platform = callerFor(superAdmin);
    const slug = `it-provision-${uniqueSuffix()}`;
    const email = `admin@${slug}.test`;
    const organization = await platform.organizations.create({
      name: 'Association provisionnée',
      slug,
      admin: { name: 'Première admin', email, password: TEST_PASSWORD },
    });
    expect(organization).toMatchObject({ slug, status: 'ACTIVE' });

    const methods = await owner.paymentMethod.findMany({
      where: { organizationId: organization.id },
      select: { code: true, isSystem: true, active: true, accountingCode: true },
    });
    expect(methods.map((m) => m.code).sort()).toEqual(
      SYSTEM_PAYMENT_METHODS.map((m) => m.code).sort(),
    );
    expect(methods.every((m) => m.isSystem && m.active)).toBe(true);
    expect(methods.find((m) => m.code === 'CREDIT_NOTE')?.accountingCode).toBe('411000');

    const taxRate = await owner.appSetting.findFirstOrThrow({
      where: { organizationId: organization.id, category: 'pricing', key: 'tax_rate' },
    });
    expect(taxRate.value).toBe('0');

    const admins = await owner.user.findMany({
      where: { organizationId: organization.id },
      select: { id: true, role: true, email: true, accounts: { select: { provider: true } } },
    });
    expect(admins).toHaveLength(1);
    expect(admins[0]).toMatchObject({
      role: 'ADMIN',
      email,
      accounts: [{ provider: 'credentials' }],
    });

    const login = await verifyCredentials(
      { portal: 'standard', organization: slug, email, password: TEST_PASSWORD },
      '192.0.2.30',
    );
    expect(login).toMatchObject({
      id: admins[0].id,
      role: 'ADMIN',
      organizationId: organization.id,
    });
    // L'admin de la nouvelle association travaille dans son espace : TGC 0 facturée.
    const pricing = await callerFor({
      id: admins[0].id,
      role: 'ADMIN',
      organizationId: organization.id,
    }).settings.getByCategory({ category: 'pricing' });
    expect(pricing.find((s) => s.key === 'tax_rate')?.value).toBe('0');

    const audit = await owner.platformAuditLog.findMany({
      where: { actorId: superAdmin.id, target: { in: [organization.id, admins[0].id] } },
      select: { action: true, organizationId: true },
    });
    expect(audit).toEqual(
      expect.arrayContaining([
        { action: 'platform.organization.created', organizationId: organization.id },
        { action: 'platform.account.created', organizationId: organization.id },
      ]),
    );
  });

  it('provisionnement atomique : identifiant pris → CONFLICT, rien n’est écrit', async () => {
    const usersBefore = await owner.user.count();
    const orgsBefore = await owner.organization.count();
    expect(
      await trpcCodeOf(
        callerFor(superAdmin).organizations.create({
          name: 'Doublon',
          slug: A.organization.slug,
          admin: {
            name: 'Doublon',
            email: `doublon-${uniqueSuffix()}@x.test`,
            password: TEST_PASSWORD,
          },
        }),
      ),
    ).toBe('CONFLICT');
    expect(
      await trpcCodeOf(
        callerFor(superAdmin).organizations.create({
          name: 'Réservé',
          slug: 'admin',
          admin: {
            name: 'Réservé',
            email: `reserve-${uniqueSuffix()}@x.test`,
            password: TEST_PASSWORD,
          },
        }),
      ),
    ).toBe('BAD_REQUEST');
    expect(await owner.user.count()).toBe(usersBefore);
    expect(await owner.organization.count()).toBe(orgsBefore);
  });

  it('modules par association : features.set pour A n’affecte pas B, et est audité', async () => {
    const platform = callerFor(superAdmin);
    await platform.features.set({ organizationId: A.organization.id, key: 'fec', enabled: false });

    expect(
      (await platform.features.forOrganization({ organizationId: A.organization.id })).fec,
    ).toBe(false);
    expect(
      (await platform.features.forOrganization({ organizationId: B.organization.id })).fec,
    ).toBe(true);
    expect((await A.adminCaller.features.get()).fec).toBe(false);
    expect((await B.adminCaller.features.get()).fec).toBe(true);
    expect(await trpcCodeOf(A.adminCaller.fec.history({ offset: 0 }))).toBe('FORBIDDEN');
    expect(await B.adminCaller.fec.history({ offset: 0 })).toEqual([]);

    const modules = await owner.appSetting.findMany({
      where: {
        category: 'features',
        key: 'modules',
        organizationId: { in: [A.organization.id, B.organization.id] },
      },
      select: { organizationId: true, value: true },
    });
    expect(modules).toHaveLength(1);
    expect(modules[0].organizationId).toBe(A.organization.id);
    expect(JSON.parse(modules[0].value ?? '{}').fec).toBe(false);

    const audit = await owner.platformAuditLog.findFirst({
      where: {
        action: 'platform.feature.disabled',
        target: 'fec',
        organizationId: A.organization.id,
      },
    });
    expect(audit?.actorId).toBe(superAdmin.id);

    await platform.features.set({ organizationId: A.organization.id, key: 'fec', enabled: true });
    expect(await A.adminCaller.fec.history({ offset: 0 })).toEqual([]);
  });

  it('module « application » coupé : toute l’association est fermée, sauf son compte', async () => {
    const platform = callerFor(superAdmin);
    await platform.features.set({
      organizationId: B.organization.id,
      key: 'application',
      enabled: false,
    });
    expect(await trpcCodeOf(B.adminCaller.children.list({ limit: 1, offset: 0 }))).toBe(
      'FORBIDDEN',
    );
    expect((await B.adminCaller.account.me())?.email).toBe(B.admin.email);
    expect((await A.adminCaller.children.list({ limit: 1, offset: 0 })).total).toBe(0);
    await platform.features.set({
      organizationId: B.organization.id,
      key: 'application',
      enabled: true,
    });
    expect((await B.adminCaller.children.list({ limit: 1, offset: 0 })).total).toBe(0);
  });

  it('liste des associations et des comptes, journal d’audit consultable', async () => {
    const platform = callerFor(superAdmin);
    const organizations = await platform.organizations.list({ limit: 50 });
    const ids = organizations.organizations.map((o) => o.id);
    expect(ids).toEqual(expect.arrayContaining([A.organization.id, B.organization.id]));
    expect(ids).not.toContain(superAdmin.organizationId);
    expect(organizations.organizations.find((o) => o.id === A.organization.id)?.accountCount).toBe(
      1,
    );

    const accounts = await platform.platform.accounts({ organizationId: A.organization.id });
    expect(accounts.accounts.map((a) => a.id)).toEqual([A.admin.id]);
    expect(accounts.accounts[0].organization.id).toBe(A.organization.id);

    const audit = await platform.platform.audit({
      action: 'platform.organization.created',
      limit: 100,
    });
    expect(audit.events.map((e) => e.target)).toEqual(
      expect.arrayContaining([A.organization.id, B.organization.id]),
    );
  });

  it('l’espace de plateforme n’est pas modifiable par les procédures d’association', async () => {
    const platform = callerFor(superAdmin);
    expect(
      await trpcCodeOf(
        platform.organizations.rename({ id: superAdmin.organizationId, name: 'Piratée' }),
      ),
    ).toBe('FORBIDDEN');
    expect(
      await trpcCodeOf(
        platform.organizations.setStatus({ id: superAdmin.organizationId, status: 'SUSPENDED' }),
      ),
    ).toBe('FORBIDDEN');
    expect(
      await trpcCodeOf(
        platform.features.set({
          organizationId: superAdmin.organizationId,
          key: 'fec',
          enabled: false,
        }),
      ),
    ).toBe('FORBIDDEN');
  });
});
