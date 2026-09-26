/* Local disposable fixtures created by audit-regressions.ts only. */
import { chromium } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const base = process.env.LOCAL_TEST_URL || 'http://localhost:3026';
if (!/^http:\/\/localhost:302[67]$/.test(base)) throw Error('Local server required');
const prisma = new PrismaClient({
  datasourceUrl: 'postgresql://postgres@127.0.0.1:55446/alvm_fixes',
});
const f = JSON.parse(fs.readFileSync('/private/tmp/alvm-fix-fixtures.json', 'utf8'));
const results = [];
const save = () =>
  fs.writeFileSync('docs/fixes-2026-09-22/browser-results.json', JSON.stringify(results, null, 2));
const record = (name, detail) => {
  results.push({ name, ...detail });
  console.log('PASS', name);
  save();
};
async function rpc(context, method, input, mutation = false) {
  return mutation
    ? context.request.post(`${base}/api/trpc/${method}`, { data: { json: input } })
    : context.request.get(
        `${base}/api/trpc/${method}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`,
      );
}
(async () => {
  await prisma.loginAttempt.deleteMany();
  const prefix = 'selector-' + Date.now();
  const uuids = Array.from({ length: 121 }, () => randomUUID());
  await prisma.user.createMany({
    data: uuids.map((id, i) => ({ id, email: `${prefix}-${i}@test.local`, role: 'PARENT' })),
  });
  await prisma.parent.createMany({
    data: uuids.map((userId, i) => ({
      userId,
      email: `${prefix}-${i}@test.local`,
      firstName: 'Volume',
      lastName: `Selection${i.toString().padStart(3, '0')}`,
      phone: '000000',
      address: '',
      city: '',
      postalCode: '',
    })),
  });
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH,
  });
  try {
    const contexts = {};
    for (const role of ['admin', 'staff', 'parent']) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        locale: 'fr-FR',
        timezoneId: 'Europe/Paris',
      });
      contexts[role] = context;
      const page = await context.newPage();
      page.setDefaultTimeout(20000);
      page.setDefaultNavigationTimeout(60000);
      await page.goto(base + '/auth/signin');
      await page.getByLabel('Email').fill(f[role].email);
      await page.getByLabel('Mot de passe', { exact: true }).fill('LocalTest123!');
      await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
      await page.waitForURL('**/dashboard/**', { timeout: 60000 });
      await context.storageState({ path: '/private/tmp/alvm-fix-' + role + '.json' });
      const paths = [
        `/dashboard/${role}`,
        `/dashboard/${role}/children`,
        `/dashboard/${role}/children/${f.child.id}/edit`,
        `/dashboard/${role}/children/adult`,
        `/dashboard/${role}/camps`,
        `/dashboard/${role}/registrations`,
        `/dashboard/${role}/invoices`,
        `/dashboard/${role}/invoices/${f.invoice.id}`,
        '/dashboard/account',
      ];
      if (role === 'admin')
        paths.push(
          '/dashboard/admin/users',
          '/dashboard/admin/registrations/new',
          '/dashboard/admin/payments/new',
          '/dashboard/admin/refunds/new',
          '/dashboard/admin/fec/export',
        );
      if (role !== 'parent') paths.push(`/dashboard/${role}/users/staff/${f.staff.id}/edit`);
      for (const path of paths) {
        const errors = [];
        const listener = (e) => errors.push(e.message);
        page.on('pageerror', listener);
        const response = await page.goto(base + path, { waitUntil: 'networkidle' });
        assert.equal(response.status(), 200, path);
        assert.equal(new URL(page.url()).pathname, path);
        assert.deepEqual(errors, [], path);
        assert.equal(
          await page
            .getByRole('alert')
            .filter({ hasText: /Impossible de charger (cette page|les données)/ })
            .count(),
          0,
          path,
        );
        page.off('pageerror', listener);
        record(`${role} ${path}`, { status: response.status(), pageErrors: errors });
      }
      for (const width of [390, 767, 768, 769]) {
        try {
          await page.setViewportSize({ width, height: 900 });
          await page.goto(base + `/dashboard/${role}`, { waitUntil: 'networkidle' });
          assert.equal(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            true,
            `${role} overflow ${width}`,
          );
          if (width < 768) {
            const trigger = page.getByRole('button', { name: 'Ouvrir le menu', exact: true });
            await trigger.click();
            await page.getByRole('dialog').waitFor();
            await page.keyboard.press('Escape');
            await page.getByRole('dialog').waitFor({ state: 'hidden' });
            assert.equal(await trigger.evaluate((e) => e === document.activeElement), true);
          } else assert.equal(await page.locator('aside').isVisible(), true);
          record(`${role} navigation ${width}px`, { overflow: false });
        } catch (error) {
          results.push({ failure: `${role} ${width}: ${error.message}` });
          save();
        }
      }
      await page.goto(base + `/dashboard/${role}/invoices`, { waitUntil: 'networkidle' });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        true,
        `${role} invoices overflow`,
      );
      await page.screenshot({ path: `docs/fixes-2026-09-22/mobile-${role}.png`, fullPage: true });
    }
    const hashBefore = await prisma.account.findFirst({
      where: { userId: f.admin.id, provider: 'credentials' },
    });
    assert.equal(
      (await rpc(contexts.staff, 'users.resetPassword', { userId: f.admin.id }, true)).status(),
      403,
    );
    assert.equal(
      (await prisma.account.findUnique({ where: { id: hashBefore.id } })).providerAccountId,
      hashBefore.providerAccountId,
    );
    record('#35 HTTP privileged reset denied and hash unchanged');
    assert.equal(
      (
        await rpc(contexts.parent, 'registrations.getAvailableCredits', {
          parentId: f.otherParent.id,
        })
      ).status(),
      403,
    );
    record('#37 HTTP cross-family credit denied');
    const anon = await browser.newContext();
    assert.equal(
      (await anon.request.get(base + `/api/documents/invoice/${f.invoice.id}`)).status(),
      401,
    );
    const otherInvoice = await prisma.invoice.findFirst({
      where: { parentId: f.otherParent.id, invoiceType: 'INVOICE' },
    });
    assert.equal(
      (
        await contexts.parent.request.get(base + `/api/documents/invoice/${otherInvoice.id}`)
      ).status(),
      404,
    );
    const pdf = await contexts.parent.request.get(base + `/api/documents/invoice/${f.invoice.id}`);
    assert.equal(pdf.status(), 200);
    assert.equal((await pdf.body()).subarray(0, 4).toString(), '%PDF');
    assert.match(pdf.headers()['cache-control'], /no-store/);
    record('#40 #76 anonymous and cross-family denial, current invoice PDF');
    const childPdf = await contexts.parent.request.get(
      base + `/api/generate/child-profile/${f.child.id}`,
    );
    assert.equal(childPdf.status(), 200);
    record('#46 parent child PDF');
    const pendingRequest = await prisma.registration.findFirstOrThrow({
      where: { parentId: f.parent.id, status: 'CONFIRMED', deletedAt: null },
    });
    assert.equal(
      (
        await rpc(
          contexts.parent,
          'registrations.requestCancellation',
          { id: pendingRequest.id },
          true,
        )
      ).status(),
      200,
    );
    const requestPage = await contexts.parent.newPage();
    await requestPage.goto(base + `/dashboard/parent/registrations/${pendingRequest.id}`, {
      waitUntil: 'networkidle',
    });
    await requestPage
      .getByText('Votre demande d’annulation a été transmise au secrétariat.')
      .waitFor();
    const staffRequest = await contexts.staff.newPage();
    await staffRequest.goto(base + `/dashboard/staff/registrations/${pendingRequest.id}`, {
      waitUntil: 'networkidle',
    });
    await staffRequest.getByRole('button', { name: 'Annuler l’inscription', exact: true }).click();
    await staffRequest.getByRole('alertdialog').waitFor();
    record('#45 #57 cancellation request visible and actionable for staff');
    // Simulate network/server failures after a successful initial render.
    const errorPage = await contexts.admin.newPage();
    await errorPage.goto(base + '/dashboard/admin/children', { waitUntil: 'networkidle' });
    await errorPage.route('**/api/trpc/children.list*', (route) => route.abort('failed'));
    await errorPage.reload({ waitUntil: 'networkidle' });
    await errorPage
      .getByRole('alert')
      .filter({ hasText: 'Impossible de charger les données' })
      .waitFor({ timeout: 30000 });
    await errorPage.unroute('**/api/trpc/children.list*');
    await errorPage.getByRole('button', { name: 'Réessayer' }).click();
    await errorPage
      .getByRole('alert')
      .filter({ hasText: 'Impossible de charger les données' })
      .waitFor({ state: 'hidden' });
    record('#86 network failure visibly recoverable');
    // Server sorting must be transmitted and pagination reset.
    const sortPage = await contexts.admin.newPage();
    await sortPage.goto(base + '/dashboard/admin/invoices', { waitUntil: 'networkidle' });
    const sortRequest = sortPage.waitForRequest(
      (r) =>
        r.url().includes('invoices.list') && decodeURIComponent(r.url()).includes('invoiceNumber'),
    );
    await sortPage.getByRole('columnheader').filter({ hasText: 'N° Facture' }).click();
    await sortRequest;
    record('#84 server sort request');
    const selector = await contexts.admin.newPage();
    await selector.goto(base + '/dashboard/admin/registrations/new', { waitUntil: 'networkidle' });
    await selector.getByLabel('Rechercher un client').fill(`${prefix}-120@test.local`);
    await selector.getByLabel('Parent', { exact: true }).click();
    await selector.getByRole('option').filter({ hasText: 'Selection120' }).click();
    record('#83 selecting a client beyond the first 100 via server search');
    // Existing cookies become unusable on password reset and role changes.
    const reset = await rpc(
      contexts.admin,
      'users.resetPassword',
      { userId: f.staff.id, newPassword: 'LocalTest123!' },
      true,
    );
    assert.equal(reset.status(), 200);
    assert.equal((await rpc(contexts.staff, 'users.list', { limit: 1, offset: 0 })).status(), 401);
    record('#38 old cookie rejected after password reset');
    await prisma.user.update({ where: { id: f.parent.id }, data: { disabledAt: new Date() } });
    try {
      assert.equal(
        (await rpc(contexts.parent, 'children.list', { limit: 1, offset: 0 })).status(),
        401,
      );
      record('#39 old cookie rejected after disable');
    } finally {
      await prisma.user.update({ where: { id: f.parent.id }, data: { disabledAt: null } });
    }
    const victim = await prisma.user.create({
      data: {
        email: `role-${Date.now()}@test.local`,
        role: 'STAFF',
        accounts: {
          create: {
            provider: 'credentials',
            type: 'credentials',
            providerAccountId: await hash('LocalTest123!', 10),
          },
        },
      },
    });
    const vc = await browser.newContext();
    const vp = await vc.newPage();
    await vp.goto(base + '/auth/signin');
    await vp.getByLabel('Email').fill(victim.email);
    await vp.getByLabel('Mot de passe', { exact: true }).fill('LocalTest123!');
    await vp.getByRole('button', { name: 'Se connecter', exact: true }).click();
    await vp.waitForURL('**/dashboard/**');
    await prisma.user.update({ where: { id: victim.id }, data: { role: 'PARENT' } });
    assert.equal((await rpc(vc, 'users.list', { limit: 1, offset: 0 })).status(), 401);
    record('#38 old cookie rejected after role downgrade');
    const login = await vc.request.get(base + '/auth/signin');
    assert.equal(login.status(), 200);
    assert.equal(new URL(login.url()).pathname, '/auth/signin');
    record('#38 revoked session can reach login without redirect loop');
    assert.equal(results.filter((r) => r.failure).length, 0, 'Browser checks failed');
  } finally {
    await browser.close();
    await prisma.$disconnect();
  }
})().catch((e) => {
  results.push({ failure: e.stack });
  save();
  console.error(e);
  process.exitCode = 1;
});
