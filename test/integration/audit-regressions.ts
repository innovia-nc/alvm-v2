/** Synthetic, disposable local database only. Run after schema + business migrations. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { prisma } from '../../server/db';
import { appRouter } from '../../server/trpc/router';
import { generateDocumentNumber } from '../../server/helpers/invoice-number';
import { consumeLoginAttempt } from '../../server/services/login-limit.service';
import { writeFileSync } from 'node:fs';
if (!process.env.POSTGRES_PRISMA_URL?.includes('127.0.0.1:55446/alvm_fixes'))
  throw Error('Disposable local alvm_fixes database required');
const prefix = randomUUID().slice(0, 8);
const results: string[] = [];
const record = (name: string) => {
  results.push(name);
  console.log('PASS', name);
};
const reject = async (promise: Promise<unknown>) => {
  await assert.rejects(promise);
};
async function main() {
  async function user(role: 'ADMIN' | 'STAFF' | 'PARENT', name: string) {
    const row = await prisma.user.create({
      data: {
        role,
        name,
        email: `${prefix}-${name}@test.local`,
        accounts: {
          create: {
            type: 'credentials',
            provider: 'credentials',
            providerAccountId: await hash('LocalTest123!', 10),
          },
        },
      },
    });
    if (role === 'PARENT')
      await prisma.parent.create({
        data: {
          userId: row.id,
          firstName: name,
          lastName: 'Test',
          email: row.email,
          phone: '123456',
          address: '',
          city: '',
          postalCode: '',
        },
      });
    if (role === 'STAFF')
      await prisma.staffMember.create({
        data: { userId: row.id, firstName: name, lastName: 'Test', email: row.email },
      });
    return row;
  }
  const admin = await user('ADMIN', 'admin');
  const staff = await user('STAFF', 'staff');
  const a = await user('PARENT', 'parenta');
  const b = await user('PARENT', 'parentb');
  const caller = (u: typeof admin) =>
    appRouter.createCaller({ user: { id: u.id, role: u.role }, prisma });
  const api = caller(admin);
  const pa = caller(a);
  const personnel = caller(staff);
  await reject(personnel.users.resetPassword({ userId: admin.id }));
  await reject(personnel.users.resetPassword({ userId: staff.id }));
  record('#35 privileged password resets refused');
  const beforeVersion = a.sessionVersion;
  await api.users.resetPassword({ userId: a.id, newPassword: 'LocalTest123!' });
  assert.equal(
    (await prisma.user.findUniqueOrThrow({ where: { id: a.id } })).sessionVersion,
    beforeVersion + 1,
  );
  record('#38 password reset revokes session version');
  await api.users.update({ id: a.id, email: `${prefix}-new@test.local` });
  assert.equal(
    (await prisma.parent.findUniqueOrThrow({ where: { userId: a.id } })).email,
    `${prefix}-new@test.local`,
  );
  record('#90 account/profile email synchronized');
  const contact = await api.parents.create({
    firstName: 'Contact',
    lastName: 'Test',
    email: `${prefix}-contact@test.local`,
    phone: '123456',
  });
  await api.users.resetPassword({ userId: contact.id, newPassword: 'LocalTest123!' });
  assert.equal(await prisma.account.count({ where: { userId: contact.id } }), 1);
  record('#49 contact activation');
  const type = await prisma.campType.create({
    data: { name: `${prefix}-Camp`, accountingCode: '706111' },
  });
  const type2 = await prisma.campType.create({
    data: { name: `${prefix}-Formation`, accountingCode: '706222' },
  });
  const campInput = {
    name: 'Camp test local',
    description: 'Description du camp de test',
    campTypeId: type.id,
    location: 'Nouméa',
    maxCapacity: 1,
    startDate: '2027-03-01',
    endDate: '2027-03-03',
    registrationDeadline: '2027-02-20',
    totalPrice: 10000,
    status: 'PUBLISHED' as const,
  };
  const camp = await api.camps.create(campInput);
  assert.equal(camp.totalPrice, 10000);
  assert.equal(await prisma.campDay.count({ where: { campId: camp.id } }), 3);
  record('#72 #73 camp days and exact total');
  async function child(parentId: string, firstName: string) {
    return prisma.child.create({
      data: {
        firstName,
        lastName: 'Test',
        birthDate: new Date('2018-01-01'),
        gender: 'OTHER',
        parentLinks: { create: { parentId, isPrimary: true } },
      },
    });
  }
  const childA = await child(a.id, 'EnfantA');
  const childB = await child(b.id, 'EnfantB');
  const childA2 = await child(a.id, 'EnfantDeux');
  await reject(pa.registrations.create({ campId: camp.id, childId: childB.id, parentId: b.id }));
  await reject(pa.registrations.getAvailableCredits({ parentId: b.id }));
  record('#36 #37 family boundaries');
  await pa.children.update({ id: childA.id, ecole: 'École locale' });
  await reject(pa.children.update({ id: childB.id, ecole: 'Interdit' }));
  record('#44 child ownership editing');
  const concurrent = await Promise.allSettled([
    api.registrations.createByStaff({
      campId: camp.id,
      childId: childA.id,
      parentId: a.id,
      status: 'CONFIRMED',
    }),
    api.registrations.createByStaff({
      campId: camp.id,
      childId: childA2.id,
      parentId: a.id,
      status: 'CONFIRMED',
    }),
  ]);
  assert.equal(concurrent.filter((r) => r.status === 'fulfilled').length, 1);
  record('#58 concurrent last-place capacity');
  const registration = await prisma.registration.findFirstOrThrow({
    where: { campId: camp.id, status: 'CONFIRMED' },
  });
  await reject(api.camps.update({ id: camp.id, maxCapacity: 0 }));
  const secondCamp = await api.camps.create({
    ...campInput,
    campTypeId: type2.id,
    maxCapacity: 20,
  });
  const reg2 = await api.registrations.createByStaff({
    campId: secondCamp.id,
    childId: childA2.id,
    parentId: a.id,
    status: 'CONFIRMED',
  });
  await reject(
    api.attendances.markBulkAttendance({
      campId: camp.id,
      date: '2027-03-01',
      attendances: [{ registrationId: reg2.id, status: 'PRESENT' }],
    }),
  );
  assert.equal(await prisma.attendance.count({ where: { registrationId: reg2.id } }), 0);
  record('#87 bulk attendance ownership and atomicity');
  await reject(
    api.invoices.create({
      dueDate: '2027-04-01',
      parentId: b.id,
      lines: [
        {
          registrationId: registration.id,
          description: 'Incorrect parent',
          quantity: 1,
          unitPrice: 10000,
        },
      ],
    }),
  );
  const invoice = await api.invoices.create({
    dueDate: '2027-04-01',
    parentId: a.id,
    lines: [
      {
        registrationId: registration.id,
        description: 'Camp une prestation',
        quantity: 1,
        unitPrice: 10000,
      },
      {
        registrationId: reg2.id,
        description: 'Formation prestation',
        quantity: 1,
        unitPrice: 10000,
      },
    ],
  });
  await reject(
    api.invoices.create({
      dueDate: '2027-04-01',
      parentId: a.id,
      lines: [
        {
          registrationId: registration.id,
          description: 'Double facturation',
          quantity: 1,
          unitPrice: 10000,
        },
      ],
    }),
  );
  record('#69 invoice ownership and uniqueness');
  const sent = await api.invoices.validate({ id: invoice.id });
  const revenue = await prisma.accountingEntry.findMany({
    where: { invoiceId: invoice.id, credit: { gt: 0 } },
  });
  assert.deepEqual(revenue.map((e) => [e.accountNumber, Number(e.credit)]).sort(), [
    ['706111', 10000],
    ['706222', 10000],
  ]);
  record('#88 grouped sales accounts');
  await reject(
    api.invoices.updateStatus({ id: invoice.id, version: sent.version, status: 'PAID' }),
  );
  record('#70 forged paid transition refused');
  const cash = await prisma.paymentMethod.upsert({
    where: { code: 'CASH' },
    update: {},
    create: { code: 'CASH', name: 'Espèces', accountingCode: '530000' },
  });
  await prisma.paymentMethod.upsert({
    where: { code: 'BANK_TRANSFER' },
    update: {},
    create: { code: 'BANK_TRANSFER', name: 'Virement', accountingCode: '512000' },
  });
  const creditMethod = await prisma.paymentMethod.upsert({
    where: { code: 'CREDIT_NOTE' },
    update: {},
    create: { code: 'CREDIT_NOTE', name: 'Avoir', accountingCode: '4191', isSystem: true },
  });
  await reject(
    api.payments.create({
      invoiceId: invoice.id,
      amount: 100,
      paymentMethodId: creditMethod.id,
      paymentDate: '2026-09-22',
    }),
  );
  record('#65 missing credit refused');
  const payments = await Promise.allSettled(
    [1, 2].map(() =>
      api.payments.create({
        invoiceId: invoice.id,
        amount: 16000,
        paymentMethodId: cash.id,
        paymentDate: '2026-09-22',
      }),
    ),
  );
  assert.equal(payments.filter((p) => p.status === 'fulfilled').length, 1);
  assert.equal(
    Number((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).paidAmount),
    16000,
  );
  record('#68 simultaneous overpayment prevented');
  assert.equal(
    (await prisma.registration.findUniqueOrThrow({ where: { id: registration.id } })).paymentStatus,
    'PARTIAL',
  );
  record('#64 clean-database payment synchronization');
  const cancellation = await api.registrations.cancelWithAccounting({
    registrationId: registration.id,
    reason: 'Annulation partielle du camp de test',
    refundChoice: 'FUTURE_CREDIT',
  });
  assert.equal(cancellation.case, 'PARTIALLY_PAID');
  assert.equal(
    Number(
      (
        await prisma.parentCredit.findFirstOrThrow({
          where: { creditNoteId: cancellation.creditNote!.id },
        })
      ).amountRemaining,
    ),
    8000,
  );
  const after = await api.invoices.getById({ id: invoice.id });
  assert.equal(after!.creditedAmount, 10000);
  assert.equal(after!.paidAmount, 8000);
  assert.equal(after!.remainingAmount, 2000);
  assert.equal(
    (await prisma.registration.findUniqueOrThrow({ where: { id: reg2.id } })).status,
    'CONFIRMED',
  );
  record('#59 #60 #62 only affected service compensated with chosen future credit');
  const third = await api.camps.create({ ...campInput, maxCapacity: 20 });
  const reg3 = await api.registrations.createByStaff({
    campId: third.id,
    childId: childA.id,
    parentId: a.id,
    status: 'CONFIRMED',
  });
  const issued = await api.invoices.createFromRegistration({
    registrationId: reg3.id,
    status: 'SENT',
  });
  assert.equal(issued.paidAmount, 8000);
  assert.equal(issued.totalAmount, 10000);
  assert.ok((await prisma.invoice.findUniqueOrThrow({ where: { id: issued.id } })).validatedById);
  record('#71 automatic FIFO on direct issue');
  const ordinary = await api.invoices.create({
    dueDate: '2027-04-01',
    parentId: b.id,
    lines: [
      { registrationId: null, description: 'Prestation manuelle', quantity: 1, unitPrice: 1000 },
    ],
  });
  const issuedOrdinary = await api.invoices.validate({ id: ordinary.id });
  await api.invoices.updateStatus({
    id: ordinary.id,
    version: issuedOrdinary.version,
    status: 'CANCELLED',
  });
  const entries = await prisma.accountingEntry.aggregate({
    where: { invoiceId: ordinary.id },
    _sum: { debit: true, credit: true },
  });
  assert.equal(Number(entries._sum.debit), Number(entries._sum.credit));
  assert.equal(await prisma.accountingEntry.count({ where: { invoiceId: ordinary.id } }), 4);
  record('#61 accounting reversal retained');
  const archived = await child(a.id, 'Archive');
  await prisma.child.update({ where: { id: archived.id }, data: { deletedAt: new Date() } });
  assert.equal(await prisma.child.count({ where: { id: archived.id } }), 0);
  assert.equal(await prisma.child.findFirst({ where: { id: archived.id } }), null);
  record('#80 Prisma soft-delete');
  const pending = await pa.registrations.create({ campId: secondCamp.id, childId: childA.id });
  assert.equal((await pa.registrations.requestCancellation({ id: pending.id })).cancelled, true);
  const replacement = await pa.registrations.create({ campId: secondCamp.id, childId: childA.id });
  assert.notEqual(replacement.id, pending.id);
  record('#45 #74 parent cancellation and re-registration');
  const adult = await api.children.createAdult({
    firstName: 'Adulte',
    lastName: 'Autonome',
    email: `${prefix}-adult@test.local`,
    phone: '123456',
    birthDate: '1990-01-01T00:00:00.000Z',
    gender: 'OTHER',
  });
  const link = await prisma.childParent.findFirstOrThrow({ where: { childId: adult.id } });
  assert.equal(link.relationship, 'self');
  record('#43 adult participant with self payer');
  const export1 = await api.fec.generateFEC({ startDate: '2026-01-01', endDate: '2027-12-31' });
  const saved = await api.fec.history({});
  assert.equal((await api.fec.downloadExport({ id: saved[0].id })).content, export1.content);
  assert.ok(
    (await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).accountingExportedAt,
  );
  record('#89 immutable FEC snapshot');
  await reject(
    prisma.$transaction(async (tx) => {
      await generateDocumentNumber(tx, 'REFUND');
      throw Error('rollback');
    }),
  );
  assert.match(await prisma.$transaction((tx) => generateDocumentNumber(tx, 'REFUND')), /^REM-/);
  record('#77 sequence usable after rollback');
  for (let i = 0; i < 10; i++)
    assert.equal(await consumeLoginAttempt(`${prefix}-rate@test.local`, new Headers()), true);
  assert.equal(await consumeLoginAttempt(`${prefix}-rate@test.local`, new Headers()), false);
  record('#41 persistent account rate limit');
  await api.parents.delete({ id: contact.id });
  assert.ok((await prisma.user.findUniqueOrThrow({ where: { id: contact.id } })).disabledAt);
  record('#39 archived profile disables access');
  writeFileSync(
    '/private/tmp/alvm-fix-fixtures.json',
    JSON.stringify(
      {
        admin,
        staff,
        parent: { ...a, email: `${prefix}-new@test.local` },
        otherParent: b,
        camp,
        child: childA,
        invoice: issued,
        results,
      },
      null,
      2,
    ),
  );
  writeFileSync(
    'docs/fixes-2026-09-22/integration-results.json',
    JSON.stringify({ date: new Date().toISOString(), results }, null, 2),
  );
}
main().finally(() => prisma.$disconnect());
