import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '../../server/db';
import { appRouter } from '../../server/trpc/router';
import { consumeLoginAttempt } from '../../server/services/login-limit.service';
if (!process.env.POSTGRES_PRISMA_URL?.includes('127.0.0.1:55446/alvm_fixes'))
  throw Error('Local disposable database required');
const f = JSON.parse(readFileSync('/private/tmp/alvm-fix-fixtures.json', 'utf8'));
const api = appRouter.createCaller({ prisma, user: { id: f.admin.id, role: 'ADMIN' } });
const publicApi = appRouter.createCaller({ prisma, user: null });
const results: string[] = [];
const record = (name: string) => {
  results.push(name);
  console.log('PASS', name);
};
async function main() {
  const payment = await prisma.payment.findFirstOrThrow({
    where: { invoice: { parentId: f.parent.id }, creditNoteId: null },
    orderBy: { createdAt: 'desc' },
  });
  const refund = await api.refunds.create({
    paymentId: payment.id,
    amount: 100,
    refundDate: '2026-09-22',
    refundMethod: 'FUTURE_CREDIT',
    reason: 'Compensation puis annulation de test',
  });
  const r = await prisma.refund.findFirstOrThrow({ where: { id: refund.id } });
  const balance = await prisma.parentCredit.findFirstOrThrow({
    where: { creditNoteId: r.creditNoteId! },
  });
  assert.equal(Number(balance.amountRemaining), 100);
  await api.refunds.delete({ id: refund.id });
  assert.equal(
    Number(
      (await prisma.parentCredit.findUniqueOrThrow({ where: { id: balance.id } })).amountRemaining,
    ),
    0,
  );
  assert.equal(
    (await prisma.invoice.findUniqueOrThrow({ where: { id: r.creditNoteId! } })).status,
    'CANCELLED',
  );
  record('#67 future refund creates usable credit and can be reversed');
  const draft = await api.creditNotes.create({
    parentId: f.otherParent.id,
    refundMethod: 'FUTURE_CREDIT',
    reason: 'Avoir autonome test réutilisation',
    lines: [{ registrationId: null, description: 'Crédit test', quantity: 1, unitPrice: 500 }],
  });
  await api.creditNotes.updateStatus({ id: draft.id, status: 'SENT' });
  const inv = await api.invoices.create({
    parentId: f.otherParent.id,
    dueDate: '2027-04-01',
    lines: [
      { registrationId: null, description: 'Facture crédit test', quantity: 1, unitPrice: 1000 },
    ],
  });
  // Set a small balance while issuing to keep manual installments available.
  await prisma.parentCredit.updateMany({
    where: { creditNoteId: draft.id },
    data: { expiresAt: new Date('2020-01-01') },
  });
  await api.invoices.validate({ id: inv.id });
  const method = await prisma.paymentMethod.findUniqueOrThrow({ where: { code: 'CREDIT_NOTE' } });
  await assert.rejects(
    api.payments.create({
      invoiceId: inv.id,
      amount: 100,
      paymentDate: '2026-09-22',
      paymentMethodId: method.id,
      creditNoteId: draft.id,
    }),
  );
  await prisma.parentCredit.updateMany({
    where: { creditNoteId: draft.id },
    data: { expiresAt: new Date('2030-01-01') },
  });
  for (let i = 0; i < 2; i++)
    await api.payments.create({
      invoiceId: inv.id,
      amount: 100,
      paymentDate: '2026-09-22',
      paymentMethodId: method.id,
      creditNoteId: draft.id,
    });
  const allocations = await prisma.creditNoteAllocation.findMany({
    where: { appliedToInvoiceId: inv.id, creditNoteId: draft.id },
  });
  assert.equal(allocations.length, 1);
  assert.equal(Number(allocations[0].amount), 200);
  await assert.rejects(api.creditNotes.updateStatus({ id: draft.id, status: 'CANCELLED' }));
  record('#65 #66 #75 expiry, repeated partial allocation, used credit cancellation refused');
  const untouched = await api.creditNotes.create({
    parentId: f.otherParent.id,
    refundMethod: 'FUTURE_CREDIT',
    reason: 'Avoir intact annulation test',
    lines: [{ registrationId: null, description: 'Crédit test', quantity: 1, unitPrice: 123 }],
  });
  await api.creditNotes.updateStatus({ id: untouched.id, status: 'SENT' });
  await api.creditNotes.updateStatus({ id: untouched.id, status: 'CANCELLED' });
  assert.equal(await prisma.accountingEntry.count({ where: { creditNoteId: untouched.id } }), 4);
  record('#75 unused credit cancellation reverses entries');
  const token = randomBytes(32).toString('hex');
  const tokenData = {
    identifier: `password:${f.otherParent.id}`,
    token: createHash('sha256').update(token).digest('hex'),
    expires: new Date(Date.now() + 60000),
  };
  await prisma.verificationToken.create({ data: tokenData });
  await publicApi.account.reset({ token, password: 'LocalTest123!' });
  await assert.rejects(publicApi.account.reset({ token, password: 'LocalTest123!' }));
  await prisma.verificationToken.create({ data: { ...tokenData, expires: new Date(0) } });
  await assert.rejects(publicApi.account.reset({ token, password: 'LocalTest123!' }));
  record('#50 recovery token expiry and one-time use');
  const key = createHash('sha256').update(`account:recovery-${token}@test.local`).digest('hex');
  await prisma.loginAttempt.create({
    data: { key, attempts: 10, windowStart: new Date(Date.now() - 16 * 60000) },
  });
  assert.equal(await consumeLoginAttempt(`recovery-${token}@test.local`, new Headers()), true);
  record('#41 throttle recovers after fixed window');
  const admins = await prisma.user.findMany({ where: { role: 'ADMIN', disabledAt: null } });
  const second = await prisma.user.create({
    data: { role: 'ADMIN', email: `last-admin-${Date.now()}@test.local` },
  });
  admins.push(second);
  const others = admins.filter((a) => a.id !== f.admin.id && a.id !== second.id);
  try {
    await prisma.user.updateMany({
      where: { id: { in: others.map((a) => a.id) } },
      data: { disabledAt: new Date() },
    });
    const outcomes = await Promise.allSettled([
      api.users.delete({ id: f.admin.id }),
      api.users.delete({ id: second.id }),
    ]);
    assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(await prisma.user.count({ where: { role: 'ADMIN', disabledAt: null } }), 1);
    record('#42 concurrent last-admin protection');
  } finally {
    await prisma.user.updateMany({
      where: { id: { in: admins.map((a) => a.id) } },
      data: { disabledAt: null },
    });
  }
  const listed = await api.invoices.list({ limit: 20, offset: 0 });
  assert.ok(listed.invoices.every((i) => !('lines' in i) && !('payments' in i)));
  record('#81 invoice list omits line/payment detail');
  writeFileSync(
    'docs/fixes-2026-09-22/followup-results.json',
    JSON.stringify({ date: new Date().toISOString(), results }, null, 2),
  );
}
main().finally(() => prisma.$disconnect());
