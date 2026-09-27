/**
 * Recette visuelle — portage des 19 critères de la recette v2.0.1
 * (docs/test-evidence/recette-v2.0.1/, archivée) dans l'espace « alvm » de la
 * plateforme multi-tenant. Couvre les 8 guides utilisateurs : connexion,
 * camps, familles, inscriptions, présences, facturation/paiements, FEC,
 * habilitations, espace parent.
 *
 * Personas : ADMIN du seed (admin@alvm.test) et PARENT créé pendant la recette.
 * Une capture probante par critère (support/recette.ts → E2E_EVIDENCE_DIR).
 * Aucune lecture de la base : l'équilibre des écritures VE est prouvé par le
 * FEC que l'écran fait télécharger.
 */
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import {
  PERSONAS,
  RUN,
  TAG,
  evidence,
  loginAs,
  rememberSession,
  searchList,
  selectByLabel,
  signIn,
  xpf,
  type Persona,
} from './support/recette';
import {
  createCamp,
  createChild,
  createInvoiceFromRegistration,
  createParent,
  createRegistration,
  openCamp,
  openChild,
  openInvoice,
  openInvoiceNumber,
  validateOpenInvoice,
} from './support/parcours';

const ADMIN = PERSONAS.alvmAdmin;
const PARENT: Persona = {
  key: 'alvm-recette-parent',
  org: 'alvm',
  email: `recette-parent-${RUN}@test.local`,
  password: 'RecetteParent2026!',
};
const PARENT_LAST = `RECETTE${TAG}`;
const PARENT_RE = new RegExp(PARENT_LAST, 'i');
const CAMP_NAME = `RECETTE Camp Toussaint ${RUN}`;
const CAMP_PRICE = 25_000;
const CHILD1 = { first: 'Léa', last: PARENT_LAST };
const CHILD2 = { first: 'Tom', last: PARENT_LAST };

// Tests enchaînés (le camp créé est facturé, le parent créé se connecte) :
// un échec n'interrompt pas les suivants, chaque critère garde son verdict.
test.describe.configure({ mode: 'default' });

test.describe('Recette ALVM — espace « alvm »', () => {
  // ——————————————————————————— AUTH (Guides 1 & 8) ———————————————————————————

  test(
    'AUTH-01 — un admin se connecte (espace alvm) et voit son tableau de bord',
    { tag: '@mobile' },
    async ({ page }, testInfo) => {
      await signIn(page, ADMIN);
      await rememberSession(page, ADMIN);
      await expect(page).toHaveURL(/\/dashboard\/admin$/);
      await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();
      await expect(page.getByText('Espace ALVM (démonstration)')).toBeVisible();
      await evidence(page, testInfo, 'AUTH-01-login-admin-01');
    },
  );

  test('AUTH-02 — un mauvais mot de passe est rejeté avec un message', async ({
    page,
  }, testInfo) => {
    await page.goto('/auth/signin?org=alvm');
    await page.getByLabel('Email', { exact: true }).fill(ADMIN.email);
    await page.getByLabel('Mot de passe', { exact: true }).fill('mauvais-mot-de-passe');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page.getByText('Espace, email ou mot de passe incorrect')).toBeVisible();
    await expect(page).toHaveURL(/\/auth\/signin/);
    await evidence(page, testInfo, 'AUTH-02-mauvais-mdp-01');
  });

  test(
    'AUTH-03 — un visiteur non connecté est redirigé vers la connexion',
    { tag: '@mobile' },
    async ({ page }, testInfo) => {
      await page.goto('/dashboard/admin/invoices');
      await page.waitForURL(/\/auth\/signin/);
      await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
      await expect(page.getByLabel('Identifiant de l’espace')).toBeVisible();
      await evidence(page, testInfo, 'AUTH-03-redirect-anonyme-01');
    },
  );

  // ——————————————————————————— ADMIN : camps (Guide 2) ———————————————————————————

  test('CAMP-01 — l’admin crée un camp publié (5 j / 25 000 XPF) et le retrouve', async ({
    page,
  }, testInfo) => {
    await loginAs(page, ADMIN);
    await createCamp(page, { name: CAMP_NAME, price: CAMP_PRICE, startIn: 21, days: 5 });
    await expect(page.getByRole('heading', { name: CAMP_NAME })).toBeVisible();
    await expect(page.getByText(xpf(CAMP_PRICE)).first()).toBeVisible();
    await evidence(page, testInfo, 'CAMP-01-creation-01');
  });

  // ——————————————————————————— ADMIN : familles (Guide 3) ———————————————————————————

  test('FAM-01 — l’admin crée un parent SANS code postal (régression 2.0.1)', async ({
    page,
  }, testInfo) => {
    await loginAs(page, ADMIN);
    await createParent(page, {
      first: 'Recette',
      last: PARENT_LAST,
      email: PARENT.email,
      password: PARENT.password,
    });
    await expect(page.getByText(PARENT.email).first()).toBeVisible();
    await expect(page.getByText(PARENT_RE).first()).toBeVisible();
    await evidence(page, testInfo, 'FAM-01-parent-sans-cp-01');
  });

  test('FAM-02 — l’admin crée un enfant rattaché au BON parent', async ({ page }, testInfo) => {
    await loginAs(page, ADMIN);
    await createChild(page, { ...CHILD1, birth: '2016-04-12', parentEmail: PARENT.email });
    // Then : la fiche de l'enfant cite le parent RECETTE (email unique).
    await openChild(page, CHILD1.first, CHILD1.last);
    await expect(page.getByRole('main').getByText(PARENT.email).first()).toBeVisible();
    await evidence(page, testInfo, 'FAM-02-enfant-cree-01');
  });

  // ——————————————————————————— ADMIN : inscription (Guide 4) ———————————————————————————

  test('INSCR-01 — l’admin inscrit l’enfant au camp (statut Confirmée)', async ({
    page,
  }, testInfo) => {
    await loginAs(page, ADMIN);
    await createRegistration(page, { parent: PARENT_RE, child: CHILD1, camp: CAMP_NAME });
    await searchList(page, /Rechercher par nom, email, camp/, PARENT_LAST);
    const row = page.getByRole('main').getByRole('row').filter({ hasText: CAMP_NAME }).first();
    await expect(row).toBeVisible();
    await expect(row.getByText('Confirmée')).toBeVisible();
    await evidence(page, testInfo, 'INSCR-01-creation-01');
  });

  // ——————————————————— ADMIN : facturation + paiement (Guide 6) ———————————————————

  test('FACT-01 — facture créée depuis l’inscription : 25 000 XPF, TGC 0 (LP 492)', async ({
    page,
  }, testInfo) => {
    await loginAs(page, ADMIN);
    await createInvoiceFromRegistration(page, PARENT_RE, PARENT_LAST);
    const main = page.getByRole('main');
    await expect(main.getByText('Brouillon').first()).toBeVisible();
    // TGC exonérée (LP 492) : taxes à 0 %, total TTC = HT = prix du camp.
    await expect(main.getByText(/Montant HT:/)).toContainText(xpf(CAMP_PRICE));
    await expect(main.getByText(/Taxes \(0\s?%\):/)).toContainText(/\b0 XPF/);
    await expect(main.getByText(/Montant total TTC:/)).toContainText(xpf(CAMP_PRICE));
    await evidence(page, testInfo, 'FACT-01-creation-tgc0-01');
  });

  test('FACT-02 — la validation passe la facture en « Émise »', async ({ page }, testInfo) => {
    await loginAs(page, ADMIN);
    await openInvoice(page, PARENT_LAST);
    const number = await validateOpenInvoice(page);
    expect(number).toMatch(/^FAC-\d{4}-\d{4}$/);
    await evidence(page, testInfo, 'FACT-02-validation-emise-01');
  });

  test('PAY-01 — le paiement du solde passe la facture en « Payée »', async ({
    page,
  }, testInfo) => {
    await loginAs(page, ADMIN);
    await page.goto('/dashboard/admin/payments/new');
    await selectByLabel(page, 'Facture', PARENT_RE);
    await page.getByLabel(/Montant/).fill(String(CAMP_PRICE));
    await page
      .getByRole('combobox')
      .filter({ hasText: /Sélectionner une méthode/ })
      .click();
    await page.getByRole('option', { name: /Virement/ }).click();
    await page.getByRole('button', { name: 'Enregistrer le paiement' }).click();
    await page.waitForURL(/\/dashboard\/admin\/payments$/);
    await evidence(page, testInfo, 'PAY-01-solde-01');

    await openInvoice(page, PARENT_LAST);
    await expect(page.getByText('Payée').first()).toBeVisible();
    await evidence(page, testInfo, 'PAY-01-facture-payee-02');
  });

  // ——————————————————————— ADMIN : présences (Guide 5) ———————————————————————

  test('PRES-01 — l’enfant inscrit (Confirmée) apparaît sur la feuille de présence', async ({
    page,
  }, testInfo) => {
    await loginAs(page, ADMIN);
    await openCamp(page, CAMP_NAME);
    await page.getByRole('tab', { name: 'Présences' }).click();
    const main = page.getByRole('main');
    const row = main.getByRole('row').filter({ hasText: `${CHILD1.last} ${CHILD1.first}` });
    await expect(row).toBeVisible();
    // Pointage du premier jour : l'enfant est marqué présent.
    await row.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Présent', exact: true }).click();
    await expect(main.getByText('1/1 présents')).toBeVisible();
    await expect(row.getByText('Présent').first()).toBeVisible();
    await evidence(page, testInfo, 'PRES-01-pointage-01');
  });

  // ——————————————————————— ADMIN : export FEC (Guide 7) ———————————————————————

  test('FEC-01 — l’export FEC est généré ; les écritures VE de la facture sont équilibrées', async ({
    page,
  }, testInfo) => {
    await loginAs(page, ADMIN);
    // Numéro de la facture de recette (fiche), pour la retrouver dans le fichier.
    await openInvoice(page, PARENT_LAST);
    const invoiceNumber = await openInvoiceNumber(page);

    await page.goto('/dashboard/admin/fec/export');
    const year = new Date().getFullYear();
    await page.getByLabel(/Date de début/).fill(`${year}-01-01`);
    await page.getByLabel(/Date de fin/).fill(`${year}-12-31`);
    await page.getByPlaceholder(/123456789/).fill('123456789');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /Générer et télécharger/ }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^123456789FEC\d{8}\.txt$/);

    // Équilibre D = C = 25 000 des écritures de VENTE de la facture (FEC : 18
    // colonnes séparées par « | », montants à virgule décimale).
    const content = await readFile((await file.path())!, 'utf8');
    const lines = content.split(/\r?\n/).filter(Boolean);
    const header = lines[0].split('|');
    const col = (name: string) => header.indexOf(name);
    const amount = (raw: string) => Number(raw.replace(/\s/g, '').replace(',', '.')) || 0;
    const sales = lines
      .slice(1)
      .map((line) => line.split('|'))
      .filter((cells) => cells[col('PieceRef')] === invoiceNumber && cells[col('JournalCode')] === 'VE');
    expect(sales.length, `écritures VE de ${invoiceNumber}`).toBeGreaterThanOrEqual(2);
    const debit = sales.reduce((sum, cells) => sum + amount(cells[col('Debit')]), 0);
    const credit = sales.reduce((sum, cells) => sum + amount(cells[col('Credit')]), 0);
    expect({ debit, credit }).toEqual({ debit: CAMP_PRICE, credit: CAMP_PRICE });
    await testInfo.attach('FEC-ecritures-VE', {
      body: [lines[0], ...sales.map((cells) => cells.join('|'))].join('\n'),
      contentType: 'text/plain',
    });
    await evidence(page, testInfo, 'FEC-01-export-01');
  });

  // ——————————————————————— ADMIN : habilitations (Guide 8) ———————————————————————

  test('HAB-01 — la gestion des accès liste les comptes et leurs rôles', async ({
    page,
  }, testInfo) => {
    await loginAs(page, ADMIN);
    await page.goto('/dashboard/admin/users');
    await expect(page.getByText(ADMIN.email).first()).toBeVisible();
    await expect(page.getByText(/Administrateur|Admin/).first()).toBeVisible();
    await expect(page.getByText(/Parent/).first()).toBeVisible();
    await evidence(page, testInfo, 'HAB-01-roles-01');
  });

  // ——————————————————————————— PARCOURS PARENT ———————————————————————————

  test('PAR-01 — le parent créé se connecte et arrive sur son espace', async ({
    page,
  }, testInfo) => {
    await signIn(page, PARENT);
    await rememberSession(page, PARENT);
    await expect(page).toHaveURL(/\/dashboard\/parent$/);
    await expect(page.getByText('Espace ALVM (démonstration)')).toBeVisible();
    await evidence(page, testInfo, 'PAR-01-login-01');
  });

  test('PAR-02 — le parent ne voit que ses propres enfants', async ({ page }, testInfo) => {
    await loginAs(page, PARENT);
    await page.goto('/dashboard/parent/children');
    await expect(page.getByText(new RegExp(CHILD1.first)).first()).toBeVisible();
    // Aucun enfant d'une autre famille d'alvm (seed : Lucas, Emma… Dupont).
    await expect(page.getByText(/Dupont|Leblanc|Bernard/)).toHaveCount(0);
    await evidence(page, testInfo, 'PAR-02-scoping-enfants-01');
  });

  test('PAR-03 — le parent ajoute lui-même un second enfant', async ({ page }, testInfo) => {
    await loginAs(page, PARENT);
    await page.goto('/dashboard/parent/children/new');
    await page.getByLabel(/^Prénom/).fill(CHILD2.first);
    await page.getByLabel(/^Nom \*/).fill(CHILD2.last);
    await page.getByLabel(/Date de naissance/).fill('2018-09-03');
    await selectByLabel(page, /Genre/, 'first');
    await page.getByRole('button', { name: /Enregistrer l'enfant/ }).click();
    await expect(page.getByText(new RegExp(CHILD2.first)).first()).toBeVisible();
    await evidence(page, testInfo, 'PAR-03-second-enfant-01');
  });

  test('PAR-04 — le parent inscrit son enfant au camp publié', async ({ page }, testInfo) => {
    await loginAs(page, PARENT);
    await page.goto('/dashboard/parent/camps');
    await page.getByRole('link', { name: new RegExp(CAMP_NAME) }).first().click();
    await expect(page.getByText('Inscription au camp')).toBeVisible();
    await page.getByRole('combobox').first().click();
    await page.getByRole('option', { name: new RegExp(CHILD2.first) }).first().click();
    await page.getByRole('button', { name: /Confirmer l'inscription/ }).click();
    await expect(
      page.getByText(/inscription.*(envoyée|créée|enregistrée|succès|attente)/i).first(),
    ).toBeVisible();
    await evidence(page, testInfo, 'PAR-04-inscription-01');
  });

  test('PAR-05 — le parent voit sa facture (et uniquement la sienne)', async ({
    page,
  }, testInfo) => {
    await loginAs(page, PARENT);
    await page.goto('/dashboard/parent/invoices');
    await expect(page.getByText(xpf(CAMP_PRICE)).first()).toBeVisible();
    await expect(page.getByText('Payée').first()).toBeVisible();
    await evidence(page, testInfo, 'PAR-05-factures-01');
  });

  test('PAR-06 — le parent est bloqué hors de son espace (admin interdit)', async ({
    page,
  }, testInfo) => {
    await loginAs(page, PARENT);
    await page.goto('/dashboard/admin/invoices');
    await page.waitForURL(/\/dashboard\/parent/);
    await expect(page).not.toHaveURL(/\/dashboard\/admin/);
    await evidence(page, testInfo, 'PAR-06-admin-interdit-01');
  });
});
