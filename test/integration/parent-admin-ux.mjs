// Local synthetic data only. Exercises the pages reported in the UI review.
import { chromium, expect as baseExpect } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const expect = baseExpect.configure({ timeout: 20000 });
const base = process.env.LOCAL_TEST_URL || 'http://localhost:3026';
if (!/^http:\/\/localhost:302[67]$/.test(base)) throw Error('Local test server required');
const out = process.env.PARENT_ADMIN_OUTPUT || '/private/tmp/alvm-users-review/browser';
fs.mkdirSync(out, { recursive: true });
const f = JSON.parse(fs.readFileSync('/private/tmp/alvm-fix-fixtures.json', 'utf8'));
const db = new PrismaClient({ datasourceUrl: 'postgresql://postgres@127.0.0.1:55446/alvm_fixes' });
const stamp = Date.now().toString();
const email = `family-ui-${stamp}@test.local`;
const family = await db.user.create({
  data: {
    email,
    role: 'PARENT',
    accounts: {
      create: {
        provider: 'credentials',
        type: 'credentials',
        providerAccountId: await hash('LocalTest123!', 10),
      },
    },
    parent: {
      create: {
        firstName: 'Famille',
        lastName: `Recette${stamp}`,
        email,
        phone: '000000',
        address: '',
        city: '',
        postalCode: '',
      },
    },
  },
});
const originalCamp = await db.camp.findUniqueOrThrow({ where: { id: f.camp.id } });
const day = 86400000;
const start = new Date(Math.floor(Date.now() / day) * day + 60 * day);
const camp = await db.camp.create({
  data: {
    name: `Découverte du lagon ${stamp}`,
    description: 'Un séjour de découverte pour toute la famille.',
    campTypeId: originalCamp.campTypeId,
    location: 'Nouméa',
    maxCapacity: 10,
    startDate: start,
    endDate: new Date(+start + 2 * day),
    registrationDeadline: new Date(+start - 7 * day),
    pricePerDay: 1000,
    totalPrice: 3000,
    status: 'PUBLISHED',
    createdBy: f.admin.id,
    days: { create: [0, 1, 2].map((i) => ({ date: new Date(+start + i * day) })) },
  },
});
const results = [],
  errors = [];
const record = (name) => {
  results.push(name);
  console.log('PASS', name);
};
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
async function login(email) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: 'fr-FR',
    timezoneId: 'Pacific/Noumea',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', (e) => errors.push({ url: page.url(), message: e.message }));
  await page.goto(base + '/auth/signin');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill('LocalTest123!');
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await page.waitForURL('**/dashboard/**');
  return { context, page };
}
async function capture(page, path, name) {
  for (const [width, theme] of [
    [390, 'light'],
    [1440, 'dark'],
  ]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate((t) => localStorage.setItem('theme', t), theme);
    await page.goto(base + path, { waitUntil: 'networkidle' });
    await expect(page.locator('main h1')).toHaveCount(1);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), path);
    await page.screenshot({
      path: `${out}/${name}-${theme}.png`,
      fullPage: true,
      animations: 'disabled',
    });
    record(`${name}: ${width}px ${theme}`);
  }
}
try {
  const admin = await login(f.admin.email);
  await capture(admin.page, '/dashboard/admin/users', 'users');
  await admin.page.getByRole('combobox', { name: 'Rôle', exact: true }).click();
  await admin.page.getByRole('option', { name: 'Administrateurs', exact: true }).click();
  await expect(admin.page.locator('tbody')).toContainText('Administrateur');
  await expect(admin.page.locator('tbody')).not.toContainText('Parent');
  await admin.page.getByRole('button', { name: 'Réinitialiser', exact: true }).click();
  await admin.page.getByRole('textbox', { name: 'Nom ou email…' }).fill(email);
  await admin.page.getByRole('button', { name: 'Rechercher', exact: true }).click();
  await expect(admin.page.locator('tbody')).toContainText(`Famille Recette${stamp}`);
  record('users: rôle et nom du profil quand le compte n’a pas de nom');
  for (const [path, button, prefix] of [
    ['camp-types', 'Ajouter un type de camp', 'Type'],
    ['payment-methods', 'Ajouter une méthode de paiement', 'Mode'],
  ]) {
    await capture(admin.page, '/dashboard/admin/settings/' + path, path);
    if (path === 'payment-methods') {
      const system = await db.paymentMethod.findFirst({ where: { isSystem: true } });
      if (system) {
        const systemRow = admin.page.getByRole('row').filter({ hasText: system.name });
        await systemRow.getByRole('button', { name: 'Modifier', exact: true }).click();
        await admin.page
          .getByRole('dialog')
          .getByRole('button', { name: 'Modifier', exact: true })
          .click();
        await expect(admin.page.getByRole('dialog')).toHaveCount(0);
        assert.equal(
          (await db.paymentMethod.findUniqueOrThrow({ where: { id: system.id } })).accountingCode,
          system.accountingCode,
        );
        record('payment-methods: code comptable historique conservé lors d’une modification');
      }
    }
    await admin.page.setViewportSize({ width: 390, height: 844 });
    const name = `${prefix} UI ${stamp}`;
    await admin.page.getByRole('button', { name: button, exact: true }).click();
    const modal = admin.page.getByRole('dialog');
    await modal.getByLabel('Nom', { exact: false }).fill(name);
    await modal.getByRole('button', { name: 'Créer', exact: true }).click();
    await expect(modal).toHaveCount(0);
    const row = admin.page.getByRole('row').filter({ hasText: name });
    await expect(row).toBeVisible();
    record(`${path}: création avec code comptable optionnel vide`);
    await row.getByRole('button', { name: 'Modifier', exact: true }).click();
    await modal.getByLabel('Nom', { exact: false }).fill(name + ' modifié');
    await modal.getByRole('button', { name: 'Modifier', exact: true }).click();
    await expect(modal).toHaveCount(0);
    await expect(row).toContainText('modifié');
    record(`${path}: modification`);
    await row.getByRole('button', { name: 'Supprimer', exact: true }).click();
    await expect(admin.page.getByRole('alertdialog')).toBeVisible();
    await admin.page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Annuler', exact: true })
      .click();
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Supprimer', exact: true }).click();
    await admin.page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Supprimer', exact: true })
      .click();
    await expect(row).toHaveCount(0);
    record(`${path}: confirmation de suppression cohérente et annulable`);
  }
  await admin.context.close();
  const fresh = await login(email);
  await fresh.page.setViewportSize({ width: 390, height: 844 });
  await fresh.page.goto(`${base}/dashboard/parent/camps/${camp.id}`, { waitUntil: 'networkidle' });
  await fresh.page.getByRole('link', { name: 'Inscrire mon enfant', exact: true }).click();
  await expect(fresh.page.locator('#inscription')).toBeInViewport();
  await fresh.page.getByRole('button', { name: 'Ajouter un enfant', exact: true }).click();
  await fresh.page.waitForURL('**/children/new?campId=*');
  await expect(fresh.page.getByRole('link', { name: 'Retour au camp' })).toHaveAttribute(
    'href',
    `/dashboard/parent/camps/${camp.id}#inscription`,
  );
  await fresh.page.getByLabel('Prénom', { exact: false }).fill('Emma');
  await fresh.page.getByLabel('Nom *', { exact: true }).fill('Recette');
  await fresh.page.getByLabel('Date de naissance', { exact: false }).fill('2016-04-15');
  await fresh.page.getByRole('button', { name: "Enregistrer l'enfant", exact: true }).click();
  await fresh.page.waitForURL(`**/camps/${camp.id}#inscription`);
  record('parent: ajouter un enfant depuis un camp ramène à l’inscription choisie');
  await fresh.page.getByRole('combobox', { name: 'Sélectionner un enfant', exact: false }).click();
  await fresh.page.getByRole('option', { name: /Emma Recette/ }).click();
  await fresh.page.getByRole('button', { name: "Confirmer l'inscription", exact: true }).click();
  await fresh.page.waitForURL('**/parent/registrations');
  await expect(
    fresh.page.getByRole('link', { name: 'Voir l’inscription', exact: true }),
  ).toBeVisible();
  record('parent: inscription depuis la fiche du camp');
  await fresh.page.getByRole('button', { name: "Annuler l'inscription", exact: true }).click();
  await fresh.page
    .getByRole('alertdialog')
    .getByRole('button', { name: "Oui, annuler l'inscription", exact: true })
    .click();
  await expect(fresh.page.getByRole('alertdialog')).toHaveCount(0);
  await expect(fresh.page.locator('main')).toContainText('Annulée');
  assert.equal(
    (await db.registration.findFirstOrThrow({ where: { parentId: family.id, campId: camp.id } }))
      .status,
    'CANCELLED',
  );
  record('parent: annulation réelle via la procédure autorisée aux familles');
  await fresh.page.getByRole('link', { name: 'Confirmées', exact: true }).click();
  await expect(
    fresh.page.getByRole('heading', { name: 'Aucune inscription pour ce statut' }),
  ).toBeVisible();
  await fresh.page.getByRole('link', { name: 'Toutes', exact: true }).click();
  await expect(fresh.page.locator('main')).toContainText('Annulée');
  record('parent: filtre visible, état vide exact et retour à toutes les inscriptions');
  await capture(fresh.page, '/dashboard/parent/children', 'children');
  await expect(fresh.page.getByRole('button', { name: 'Supprimer' })).toHaveCount(0);
  await fresh.page.getByRole('link', { name: 'Voir la fiche', exact: true }).click();
  await expect(fresh.page.locator('main h1')).toContainText('Emma');
  record('parent: accès direct à la fiche enfant sans action de suppression interdite');
  await fresh.context.close();
  const parent = await login(f.parent.email);
  for (const [path, name] of [
    ['/dashboard/parent', 'parent-home'],
    ['/dashboard/parent/camps', 'camps'],
    [`/dashboard/parent/camps/${camp.id}`, 'camp-detail'],
    ['/dashboard/parent/registrations', 'registrations'],
    ['/dashboard/parent/invoices', 'invoices'],
  ])
    await capture(parent.page, path, name);
  await expect(parent.page.getByRole('button', { name: 'Payer maintenant' })).toHaveCount(0);
  const invoicePdf = parent.page.locator(`a[href="/api/documents/invoice/${f.invoice.id}"]`);
  await expect(invoicePdf).toBeVisible();
  const response = await parent.context.request.get(base + (await invoicePdf.getAttribute('href')));
  assert.equal(response.status(), 200);
  assert.equal((await response.body()).subarray(0, 4).toString(), '%PDF');
  record('parent: téléchargement PDF depuis la liste par la route authentifiée');
  await parent.page.goto(`${base}/dashboard/parent/invoices/${f.invoice.id}#reglement`, {
    waitUntil: 'networkidle',
  });
  await expect(parent.page.locator('#reglement')).toBeInViewport();
  await expect(parent.page.locator('#reglement')).toContainText('secrétariat');
  record('parent: modalités de règlement accessibles depuis la liste');
  await parent.context.close();
  assert.deepEqual(errors, [], 'Browser runtime errors');
  record('aucune erreur JavaScript sur les parcours');
} finally {
  fs.writeFileSync(`${out}/results.json`, JSON.stringify({ results, errors }, null, 2));
  await browser.close();
  await db.$disconnect();
}
