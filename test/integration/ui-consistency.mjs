// Read-only UI inventory on the synthetic local database prepared by audit-regressions.ts.
import { chromium, expect as baseExpect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const expect = baseExpect.configure({ timeout: 20000 });
const base = process.env.LOCAL_TEST_URL || 'http://localhost:3026';
if (!/^http:\/\/localhost:302[67]$/.test(base)) throw Error('Local test server required');
const out = process.env.UI_CONSISTENCY_OUTPUT || '/private/tmp/alvm-consistency/browser';
fs.mkdirSync(out, { recursive: true });
const fixture = JSON.parse(fs.readFileSync('/private/tmp/alvm-fix-fixtures.json', 'utf8'));
const db = new PrismaClient({ datasourceUrl: 'postgresql://postgres@127.0.0.1:55446/alvm_fixes' });
const [registration, payment, refund, credit] = await Promise.all([
  db.registration.findFirst({
    where: { childId: fixture.child.id, parentId: fixture.parent.id, deletedAt: null },
  }),
  db.payment.findFirst({ where: { invoiceId: fixture.invoice.id } }),
  db.refund.findFirst(),
  db.invoice.findFirst({ where: { invoiceType: 'CREDIT_NOTE', deletedAt: null } }),
]);
await db.$disconnect();
const ids = {
  children: fixture.child.id,
  camps: fixture.camp.id,
  registrations: registration?.id,
  invoices: fixture.invoice.id,
  payments: payment?.id,
  refunds: refund?.id,
  'credit-notes': credit?.id,
  parents: fixture.parent.id,
  users: fixture.parent.id,
  staff: fixture.staff.id,
};
function pages(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? pages(path.join(dir, e.name))
        : e.name === 'page.tsx'
          ? [path.join(dir, e.name)]
          : [],
    );
}
const files = pages('app/dashboard');
const results = [],
  failures = [],
  errors = [];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const capture = new Set([
  '/dashboard/admin/users/parents/new',
  '/dashboard/admin/children/' + fixture.child.id,
  '/dashboard/admin/settings',
  '/dashboard/admin/camps/' + fixture.camp.id,
  '/dashboard/parent/invoices/' + fixture.invoice.id,
  '/dashboard/account',
]);
try {
  for (const role of ['admin', 'staff', 'parent']) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      locale: 'fr-FR',
      timezoneId: 'Pacific/Noumea',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.setDefaultNavigationTimeout(90000);
    page.on('pageerror', (e) => errors.push({ role, url: page.url(), message: e.message }));
    await page.goto(base + '/auth/signin');
    await page.getByLabel('Email').fill(fixture[role].email);
    await page.getByLabel('Mot de passe', { exact: true }).fill('LocalTest123!');
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
    await page.waitForURL('**/dashboard/' + role);
    const routes = files
      .filter(
        (f) =>
          f.startsWith('app/dashboard/' + role + '/') || f === 'app/dashboard/account/page.tsx',
      )
      .sort()
      .map((f) => {
        const route = '/' + f.slice(4, -'/page.tsx'.length);
        const parts = route.split('/');
        const idIndex = parts.indexOf('[id]');
        if (idIndex >= 0) {
          const id = ids[parts[idIndex - 1]];
          assert.ok(id, `Missing local fixture for ${route}`);
          parts[idIndex] = id;
        }
        return parts.join('/');
      });
    for (const route of routes) {
      for (const { width, theme } of [
        { width: 390, theme: 'light' },
        { width: 1440, theme: 'dark' },
      ]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate((t) => localStorage.setItem('theme', t), theme);
        try {
          const response = await page.goto(base + route, { waitUntil: 'networkidle' });
          assert.equal(response.status(), 200, route);
          if (route.endsWith('/users/staff/' + fixture.staff.id)) {
            await expect(page.getByRole('link', { name: 'Modifier', exact: true })).toHaveAttribute(
              'href',
              route + '/edit',
            );
          }
          await expect(page.locator('main h1')).toHaveCount(1);
          await expect(page.locator('main')).not.toContainText(
            /Impossible de charger (cette page|les données)/,
          );
          const geometry = await page.evaluate(() => ({
            viewport: innerWidth,
            content: document.documentElement.scrollWidth,
            offenders: [...document.querySelectorAll('main *')]
              .filter((e) => {
                const r = e.getBoundingClientRect();
                return (
                  r.right > innerWidth + 1 &&
                  getComputedStyle(e).position !== 'absolute' &&
                  !e.closest('table')
                );
              })
              .slice(0, 6)
              .map((e) => ({
                tag: e.tagName,
                cls: e.className,
                text: e.textContent?.slice(0, 60),
              })),
          }));
          assert.ok(geometry.content <= width, JSON.stringify(geometry));
          results.push({ role, route, width, theme });
          if (capture.has(route))
            await page.screenshot({
              path: `${out}/${role}-${route.replaceAll('/', '_')}-${theme}.png`,
              fullPage: true,
              animations: 'disabled',
            });
        } catch (error) {
          failures.push({ role, route, width, theme, message: error.message });
          await page.screenshot({ path: `${out}/failure-${failures.length}.png`, fullPage: true });
          console.log('FAIL', role, route, width, error.message.slice(0, 1200));
        }
      }
      console.log('CHECKED', role, route);
    }
    if (role === 'admin') {
      await page.setViewportSize({ width: 390, height: 680 });
      await page.goto(base + '/dashboard/admin/settings/camp-types', { waitUntil: 'networkidle' });
      // A table can fit the viewport while squeezing every word into a vertical column.
      // Its first fixture label must remain readable; horizontal scrolling is intentional.
      const firstCell = await page.locator('tbody tr').first().locator('td').first().boundingBox();
      assert.ok(firstCell.height < 120, 'Table label squeezed into individual letters');
      results.push({ role, interaction: 'mobile table labels remain readable' });
      await page.getByRole('button', { name: /Ajouter un type de camp/ }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveCSS('opacity', '1');
      const box = await dialog.boundingBox();
      assert.ok(
        box.x >= 0 && box.x + box.width <= 390 && box.y >= 0 && box.y + box.height <= 680,
        'Dialog outside viewport',
      );
      await page.screenshot({ path: `${out}/dialog-mobile.png`, animations: 'disabled' });
      await page.getByRole('button', { name: 'Fermer', exact: true }).click();
      await expect(page.getByRole('button', { name: /Ajouter un type de camp/ })).toBeFocused();
      results.push({ role, interaction: 'dialog fits viewport and restores focus' });
      await page.goto(base + '/dashboard/admin/children', { waitUntil: 'networkidle' });
      const search = page.getByRole('textbox');
      await search.fill('AbsentConsistency');
      await search.press('Enter');
      await expect(page.getByText('Aucun résultat pour « AbsentConsistency »')).toBeVisible();
      await page.getByRole('button', { name: 'Réinitialiser', exact: true }).click();
      await expect(search).toHaveValue('');
      results.push({ role, interaction: 'reset filters clears the visible applied search' });
    }
    await context.close();
  }
  assert.deepEqual(failures, [], 'Page audit failures');
  assert.deepEqual(errors, [], 'Runtime errors');
} finally {
  fs.writeFileSync(`${out}/results.json`, JSON.stringify({ results, failures, errors }, null, 2));
  await browser.close();
}
