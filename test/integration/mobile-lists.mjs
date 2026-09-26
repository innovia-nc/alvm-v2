import { chromium } from '@playwright/test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const f = JSON.parse(fs.readFileSync('/private/tmp/alvm-fix-fixtures.json', 'utf8'));
const base = 'http://localhost:3026';
const results = [];
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH,
});
try {
  for (const role of ['admin', 'staff', 'parent']) {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      locale: 'fr-FR',
    });
    const page = await ctx.newPage();
    page.setDefaultNavigationTimeout(60000);
    await page.goto(base + '/auth/signin');
    await page.getByLabel('Email').fill(f[role].email);
    await page.getByLabel('Mot de passe', { exact: true }).fill('LocalTest123!');
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
    await page.waitForURL('**/dashboard/**');
    for (const kind of ['children', 'registrations', 'invoices']) {
      const path = `/dashboard/${role}/${kind}`;
      await page.goto(base + path, { waitUntil: 'networkidle' });
      const overflow = await page.evaluate(() => ({
        width: innerWidth,
        content: document.documentElement.scrollWidth,
        mainWidth: document.querySelector('main').clientWidth,
        mainContent: document.querySelector('main').scrollWidth,
        offenders: [...document.querySelectorAll('main *')]
          .filter(
            (e) =>
              e.getBoundingClientRect().right > innerWidth + 1 &&
              getComputedStyle(e).position !== 'absolute',
          )
          .slice(0, 8)
          .map((e) => ({ tag: e.tagName, cls: e.className })),
      }));
      results.push({ role, kind, ...overflow });
      console.log(role, kind, overflow.content);
      await page.screenshot({
        path: `docs/fixes-2026-09-22/mobile-${role}-${kind}.png`,
        fullPage: true,
      });
    }
    await ctx.close();
  }
  fs.writeFileSync('docs/fixes-2026-09-22/mobile-results.json', JSON.stringify(results, null, 2));
  assert.ok(
    results.every((r) => r.content <= r.width && r.mainContent <= r.mainWidth),
    'Mobile list overflow',
  );
} finally {
  await browser.close();
}
