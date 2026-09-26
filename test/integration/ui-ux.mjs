// Uses only the synthetic accounts from audit-regressions.ts. No business data is written.
import { chromium, expect as baseExpect } from '@playwright/test';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const expect = baseExpect.configure({ timeout: 20000 });
const base = process.env.LOCAL_TEST_URL || 'http://localhost:3026';
if (!/^http:\/\/localhost:302[67]$/.test(base)) throw Error('Local test server required');
const fixtures = JSON.parse(fs.readFileSync('/private/tmp/alvm-fix-fixtures.json', 'utf8'));
const output = process.env.UI_UX_OUTPUT || '/private/tmp/alvm-ux/browser';
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const results = [];
const errors = [];
const record = (name) => {
  results.push(name);
  console.log('PASS', name);
};
async function fits(page, label) {
  const dimensions = await page.evaluate(() => ({
    viewport: innerWidth,
    content: document.documentElement.scrollWidth,
  }));
  assert.ok(dimensions.content <= dimensions.viewport, `${label}: ${JSON.stringify(dimensions)}`);
}
try {
  for (const role of ['admin', 'staff', 'parent']) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      locale: 'fr-FR',
      timezoneId: 'Pacific/Noumea',
      colorScheme: 'dark',
    });
    await context.addInitScript(() => {
      if (!localStorage.getItem('theme')) localStorage.setItem('theme', 'dark');
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(60000);
    page.on('pageerror', (e) => errors.push({ role, url: page.url(), message: e.message }));
    await page.goto(`${base}/auth/signin`);
    await page.getByLabel('Email').fill(fixtures[role].email);
    await page.getByLabel('Mot de passe', { exact: true }).fill('LocalTest123!');
    await page.getByRole('button', { name: 'Afficher le mot de passe', exact: true }).click();
    await expect(page.getByLabel('Mot de passe', { exact: true })).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: 'Masquer le mot de passe', exact: true }).click();
    await expect(page.getByLabel('Mot de passe', { exact: true })).toHaveAttribute(
      'type',
      'password',
    );
    if (role === 'admin') {
      await page.getByLabel('Mot de passe', { exact: true }).fill('WrongPassword123!');
      await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
      await expect(page.locator('form').getByRole('alert')).toContainText(
        'Email ou mot de passe incorrect',
      );
      await page.getByLabel('Mot de passe', { exact: true }).fill('LocalTest123!');
    }
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
    await page.waitForURL(`**/dashboard/${role}`);
    await expect(page.getByRole('region', { name: 'Priorités' })).toBeVisible();
    record(`${role}: connexion réelle et visibilité du mot de passe`);
    // A saved dark theme must switch to light on the first click.
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.screenshot({ path: `${output}/${role}-dark.png`, fullPage: true });
    await page.getByRole('button', { name: 'Changer le thème' }).click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    record(`${role}: bascule depuis le thème sombre mémorisé`);
    await page.screenshot({ path: `${output}/${role}-desktop.png`, fullPage: true });
    await page.getByRole('button', { name: 'Ouvrir le menu du compte' }).click();
    await expect(page.getByRole('menuitem', { name: 'Mon compte' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('link', { name: 'Aller au contenu principal' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('main')).toBeFocused();
    record(`${role}: menu du compte et accès direct au contenu`);

    const paths = ['', '/children', '/camps', '/registrations', '/invoices'];
    if (role === 'admin')
      paths.push('/users/parents', '/settings/camp-types', '/registrations/new', '/payments/new');
    for (const path of paths) {
      const response = await page.goto(`${base}/dashboard/${role}${path}`, {
        waitUntil: 'networkidle',
      });
      assert.equal(response.status(), 200);
      assert.equal(new URL(page.url()).pathname, `/dashboard/${role}${path}`);
      await expect(page.locator('main')).not.toContainText('Impossible de charger');
      const active = page
        .getByRole('navigation', { name: 'Navigation principale' })
        .locator('[aria-current="page"]');
      await expect(active).toHaveCount(1);
      await fits(page, role + path);
      record(`${role}${path || '/'}: écran et destination active unique`);
    }
    if (role === 'admin') {
      await page.goto(`${base}/dashboard/admin/users/parents`, { waitUntil: 'networkidle' });
      const search = page.getByRole('textbox');
      await search.fill('zz-no-match-ui-ux');
      await search.press('Enter');
      await expect(
        page.getByRole('cell', { name: 'Aucun résultat pour « zz-no-match-ui-ux »' }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Effacer la recherche' }).click();
      await expect(page.locator('tbody tr')).toHaveCount(20);
      const heading = page.locator('th[aria-sort]').first();
      const sortButton = heading.getByRole('button');
      await sortButton.focus();
      await page.keyboard.press('Enter');
      await expect(heading).toHaveAttribute('aria-sort', 'ascending');
      await expect(page.locator('tbody tr')).toHaveCount(20);
      await expect(sortButton).toBeFocused();
      await page.keyboard.press('Space');
      await expect(heading).toHaveAttribute('aria-sort', 'descending');
      record('admin: recherche sans résultat, réinitialisation et tri clavier');
      // A reduced desktop menu must show readable links when switching to mobile.
      await page.getByRole('button', { name: 'Réduire le menu' }).click();
    }
    for (const width of [320, 390, 767, 768, 1024]) {
      await page.setViewportSize({ width, height: 844 });
      for (const path of [
        '',
        '/children',
        '/registrations',
        '/invoices',
        ...(role === 'admin' ? ['/users/parents'] : []),
      ]) {
        await page.goto(`${base}/dashboard/${role}${path}`, { waitUntil: 'networkidle' });
        await fits(page, `${role}${path} ${width}px`);
      }
      if (width < 768) {
        await page.getByRole('button', { name: 'Ouvrir le menu', exact: true }).click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        const campLink = dialog.getByRole('link', {
          name: role === 'parent' ? 'Camps Disponibles' : 'ACM',
          exact: true,
        });
        await expect(campLink).toContainText(role === 'parent' ? 'Camps Disponibles' : 'ACM');
        await page.keyboard.press('Escape');
        await expect(page.getByRole('button', { name: 'Ouvrir le menu', exact: true })).toBeFocused();
      }
      record(`${role}: listes, tableau de bord et menu à ${width}px sans débordement`);
      if (width === 390) {
        if (role === 'admin') {
          const pagination = page.getByRole('navigation', { name: 'pagination' });
          await pagination.getByRole('link', { name: 'Aller à la page suivante' }).click();
          await expect(pagination).toContainText('Page 2 sur');
          await page.waitForLoadState('networkidle');
          await fits(page, 'mobile pagination');
          await page.screenshot({ path: `${output}/admin-mobile-list.png`, fullPage: true });
          record('admin: pagination mobile au-delà de 20 pages');
        }
        await page.goto(`${base}/dashboard/${role}`, { waitUntil: 'networkidle' });
        await page.screenshot({ path: `${output}/${role}-mobile.png`, fullPage: true });
      }
    }
    await context.close();
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${base}/auth/signin`);
  await fits(page, 'connexion mobile');
  await page.screenshot({ path: `${output}/signin-mobile.png`, fullPage: true });
  assert.deepEqual(errors, [], 'Browser runtime errors');
  record('aucune erreur JavaScript sur les parcours testés');
} finally {
  fs.writeFileSync(`${output}/results.json`, JSON.stringify({ results, errors }, null, 2));
  await browser.close();
}
