import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { prisma } from '../../server/db';
import { appRouter } from '../../server/trpc/router';
import { generateAndStoreInvoicePdf } from '../../server/services/invoice-pdf.service';
if (!process.env.POSTGRES_PRISMA_URL?.includes('127.0.0.1:55446/alvm_fixes'))
  throw Error('Local disposable database required');
const f = JSON.parse(readFileSync('/private/tmp/alvm-fix-fixtures.json', 'utf8'));
const api = appRouter.createCaller({ prisma, user: { id: f.admin.id, role: 'ADMIN' } });
async function main() {
  const self = await prisma.childParent.findFirstOrThrow({
    where: { relationship: 'self', child: { deletedAt: null } },
  });
  const original = await prisma.camp.findUniqueOrThrow({ where: { id: f.camp.id } });
  const camp = await api.camps.create({
    name: 'Formation adulte de validation',
    description: 'Formation fictive pour vérifier les parcours adultes',
    campTypeId: original.campTypeId,
    location: 'Nouméa',
    maxCapacity: 10,
    startDate: '2027-03-01',
    endDate: '2027-03-03',
    registrationDeadline: '2027-02-20',
    totalPrice: 10000,
    status: 'PUBLISHED',
  });
  const reg = await api.registrations.createByStaff({
    campId: camp.id,
    childId: self.childId,
    parentId: self.parentId,
    status: 'CONFIRMED',
  });
  await api.attendances.markBulkAttendance({
    campId: camp.id,
    date: '2027-03-01',
    attendances: [{ registrationId: reg.id, status: 'PRESENT' }],
  });
  const invoice = await api.invoices.createFromRegistration({
    registrationId: reg.id,
    status: 'SENT',
  });
  assert.equal(invoice.totalAmount, 10000);
  assert.equal(invoice.parentId, self.parentId);
  assert.equal(
    await prisma.attendance.count({ where: { registrationId: reg.id, status: 'PRESENT' } }),
    1,
  );
  const rendered = await generateAndStoreInvoicePdf(prisma, invoice.id, false);
  assert.equal(rendered.pdfBuffer.subarray(0, 4).toString(), '%PDF');
  const results = ['#43 adult self-payer registration, attendance, exact invoice and rendered PDF'];
  console.log('PASS', results[0]);
  writeFileSync(
    'docs/fixes-2026-09-22/adult-results.json',
    JSON.stringify({ date: new Date().toISOString(), results }, null, 2),
  );
}
main().finally(() => prisma.$disconnect());
