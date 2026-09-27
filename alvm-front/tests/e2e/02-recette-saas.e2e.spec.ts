/**
 * Recette visuelle multi-tenant (refonte SaaS 3.0.0) : création d'une
 * association par le super admin, isolation des espaces (RLS), même email
 * dans deux espaces, suspension, modules par association, cloisonnement du
 * super admin, numérotation des pièces par tenant, secret interne du back.
 *
 * S'exécute après la recette ALVM (01-…) : SAAS-03 et SAAS-08 s'appuient sur
 * la facture qu'elle a créée dans « alvm ».
 */
import { expect, test, type Page } from '@playwright/test';
import {
  PERSONAS,
  RUN,
  TAG,
  evidence,
  loginAs,
  newWindow,
  rememberSession,
  searchList,
  signIn,
  type Persona,
} from './support/recette';
import {
  createCamp,
  createCampType,
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

const ORG = { name: `Recette SaaS ${RUN}`, slug: `recette-saas-${RUN}` };
const NEW_ADMIN: Persona = {
  key: `new-admin-${RUN}`,
  org: ORG.slug,
  email: `admin@recette-${RUN}.test`,
  password: 'RecetteAdmin2026',
};
const BACK_URL = process.env.E2E_BACK_URL ?? 'http://127.0.0.1:4102';
const NOT_FOUND = /Élément introuvable|ACM introuvable/;
const EMPTY_LIST = /Aucune donnée|Aucun résultat/;

test.describe.configure({ mode: 'default' });

/** Ouvre le détail d'une association depuis l'écran d'accueil du super admin. */
async function openOrganization(page: Page, name: string): Promise<void> {
  await page.goto('/dashboard/super-admin');
  const main = page.getByRole('main');
  await main.getByLabel('Rechercher une association').fill(name);
  await main.getByRole('link', { name, exact: true }).click();
  await page.waitForURL(/\/dashboard\/super-admin\/organizations\/[0-9a-f-]{36}$/);
  await expect(main.getByText(name).first()).toBeVisible();
}

/** Lien de la navigation principale (menu latéral). */
function navLink(page: Page, name: string) {
  return page
    .getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('link', { name, exact: true });
}

test.describe('Recette multi-tenant — plateforme SaaS', () => {
  test('SAAS-01 — le super admin crée une association et son premier admin', async ({
    page,
  }, testInfo) => {
    await loginAs(page, PERSONAS.superAdmin);
    await page.goto('/dashboard/super-admin');
    const main = page.getByRole('main');
    await main.getByRole('button', { name: 'Créer une association' }).click();
    await main.getByLabel('Nom de l’association').fill(ORG.name);
    // Identifiant proposé depuis le nom (sans accents, tirets).
    await expect(main.getByLabel('Identifiant de l’espace')).toHaveValue(ORG.slug);
    await main.getByLabel('Administrateur — nom').fill('Admin Recette');
    await main.getByLabel('Administrateur — email').fill(NEW_ADMIN.email);
    await main.getByLabel('Mot de passe initial').fill(NEW_ADMIN.password);
    await evidence(page, testInfo, 'SAAS-01-formulaire-01');
    await main.getByRole('button', { name: 'Créer l’association' }).click();
    await expect(page.getByText(`Association « ${ORG.name} » créée`)).toBeVisible();

    await main.getByLabel('Rechercher une association').fill(ORG.slug);
    const row = main.getByRole('row').filter({ hasText: ORG.slug });
    await expect(row).toContainText(ORG.name);
    await expect(row).toContainText('Active');
    await evidence(page, testInfo, 'SAAS-01-association-creee-02');

    // Détail : le premier compte est l'administrateur saisi.
    await openOrganization(page, ORG.name);
    await expect(main.getByText(NEW_ADMIN.email)).toBeVisible();
    await evidence(page, testInfo, 'SAAS-01-premier-admin-03');
  });

  test('SAAS-02 — le nouvel admin se connecte via /o/<identifiant> et trouve un espace vide', async ({
    page,
  }, testInfo) => {
    await page.goto(`/o/${ORG.slug}`);
    await page.waitForURL(new RegExp(`/auth/signin\\?org=${ORG.slug}$`));
    await expect(page.getByLabel('Identifiant de l’espace')).toHaveValue(ORG.slug);
    // Nom de l'association affiché sous l'identifiant (espace reconnu).
    await expect(page.locator('#organization-status')).toHaveText(ORG.name);
    await evidence(page, testInfo, 'SAAS-02-lien-espace-01');

    await page.getByLabel('Email', { exact: true }).fill(NEW_ADMIN.email);
    await page.getByLabel('Mot de passe', { exact: true }).fill(NEW_ADMIN.password);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await page.waitForURL(/\/dashboard\/admin$/);
    await rememberSession(page, NEW_ADMIN);
    await expect(page.getByText(`Espace ${ORG.name}`)).toBeVisible();

    // Espace vide : aucune donnée d'alvm (ni d'aucune autre association).
    const main = page.getByRole('main');
    for (const list of ['children', 'camps', 'invoices', 'users/parents']) {
      await page.goto(`/dashboard/admin/${list}`);
      await expect(main.getByText(EMPTY_LIST).first()).toBeVisible();
      await expect(main.getByText(/Dupont|Leblanc|RECETTE|FAC-/)).toHaveCount(0);
    }
    await page.goto('/dashboard/admin/children');
    await expect(main.getByText(EMPTY_LIST).first()).toBeVisible();
    await evidence(page, testInfo, 'SAAS-02-espace-vide-02');
  });

  test('SAAS-03 — isolation : l’admin d’asso-demo ne voit ni ne peut ouvrir les fiches d’alvm', async ({
    page,
    browser,
  }, testInfo) => {
    // Identifiants de fiches d'alvm, relevés dans l'interface d'alvm.
    const alvm = await newWindow(browser, testInfo);
    await loginAs(alvm, PERSONAS.alvmAdmin);
    const childId = await openChild(alvm, 'Lucas', 'Dupont');
    const campId = await openCamp(alvm, 'Stage Football Intensif');
    const invoiceId = await openInvoice(alvm, 'RECETTE');
    const invoiceNumber = await openInvoiceNumber(alvm);
    await alvm.context().close();

    await loginAs(page, PERSONAS.demoAdmin);
    const main = page.getByRole('main');
    await expect(page.getByText('Espace Association Démo')).toBeVisible();

    // Listes : uniquement les données d'asso-demo.
    await page.goto('/dashboard/admin/children');
    await expect(main.getByText('Paul Dupont')).toBeVisible();
    await expect(main.getByText(/Lucas|Emma|Hugo|Chloé/)).toHaveCount(0);
    await evidence(page, testInfo, 'SAAS-03-enfants-asso-demo-01');
    await searchList(page, /Rechercher par nom ou parent/, 'Lucas');
    await expect(main.getByText('Aucun résultat pour « Lucas »').first()).toBeVisible();

    await page.goto('/dashboard/admin/camps');
    await expect(main.getByText('Stage découverte — Koné')).toBeVisible();
    await expect(main.getByText(/Football|Robotique|Multi-activités - Vacances/)).toHaveCount(0);

    await page.goto('/dashboard/admin/invoices');
    await searchList(page, /Rechercher par numéro, nom ou email/, invoiceNumber);
    await expect(main.getByText(`Aucun résultat pour « ${invoiceNumber} »`).first()).toBeVisible();
    await evidence(page, testInfo, 'SAAS-03-facture-alvm-absente-02');

    // Accès direct aux URL des fiches d'alvm : introuvables.
    await page.goto(`/dashboard/admin/children/${childId}`);
    await expect(main.getByText(NOT_FOUND).first()).toBeVisible();
    await expect(main.getByText('Lucas')).toHaveCount(0);
    await evidence(page, testInfo, 'SAAS-03-fiche-enfant-alvm-introuvable-03');
    await page.goto(`/dashboard/admin/invoices/${invoiceId}`);
    await expect(main.getByText(NOT_FOUND).first()).toBeVisible();
    await evidence(page, testInfo, 'SAAS-03-fiche-facture-alvm-introuvable-04');
    await page.goto(`/dashboard/admin/camps/${campId}`);
    await expect(main.getByText(NOT_FOUND).first()).toBeVisible();
    await expect(main.getByText('Stage Football Intensif')).toHaveCount(0);
  });

  test(
    'SAAS-04 — même email dans deux espaces : deux familles distinctes',
    { tag: '@mobile' },
    async ({ page, browser }, testInfo) => {
      await signIn(page, PERSONAS.alvmParentSeed);
      await rememberSession(page, PERSONAS.alvmParentSeed);
      await expect(page).toHaveURL(/\/dashboard\/parent$/);
      await expect(page.getByText('Espace ALVM (démonstration)')).toBeVisible();
      await page.goto('/dashboard/parent/children');
      const main = page.getByRole('main');
      for (const name of ['Lucas', 'Emma', 'Léa'])
        await expect(main.getByText(name).first()).toBeVisible();
      await expect(main.getByText('Paul')).toHaveCount(0);
      await evidence(page, testInfo, 'SAAS-04-famille-alvm-01');

      const demo = await newWindow(browser, testInfo);
      await signIn(demo, PERSONAS.demoParentSeed);
      await rememberSession(demo, PERSONAS.demoParentSeed);
      await expect(demo.getByText('Espace Association Démo')).toBeVisible();
      await demo.goto('/dashboard/parent/children');
      const demoMain = demo.getByRole('main');
      await expect(demoMain.getByText('Paul').first()).toBeVisible();
      await expect(demoMain.getByText(/Lucas|Emma|Léa/)).toHaveCount(0);
      await evidence(demo, testInfo, 'SAAS-04-famille-asso-demo-02');
      await demo.context().close();
    },
  );

  test('SAAS-05 — suspendre l’association révoque la session de son admin et refuse la reconnexion', async ({
    page,
    browser,
  }, testInfo) => {
    // Session ouverte de l'admin de l'association (SAAS-02).
    await loginAs(page, NEW_ADMIN);
    await page.goto('/dashboard/admin');
    await expect(page.getByText(`Espace ${ORG.name}`)).toBeVisible();
    const cookiesBefore = await page.context().cookies();

    const superAdmin = await newWindow(browser, testInfo);
    await loginAs(superAdmin, PERSONAS.superAdmin);
    await openOrganization(superAdmin, ORG.name);
    const saMain = superAdmin.getByRole('main');
    superAdmin.once('dialog', (dialog) => dialog.accept());
    await saMain.getByRole('button', { name: 'Suspendre l’association' }).click();
    await expect(superAdmin.getByText('Association suspendue : connexions refusées')).toBeVisible();
    await expect(saMain.getByText('Suspendue').first()).toBeVisible();
    await evidence(superAdmin, testInfo, 'SAAS-05-association-suspendue-01');

    try {
      // Requête suivante de l'admin : session révoquée → connexion.
      await page.reload();
      await page.waitForURL(/\/auth\/signin/);
      await evidence(page, testInfo, 'SAAS-05-session-revoquee-02');

      // Reconnexion refusée (message indistinct : pas d'énumération des espaces).
      await page.goto(`/auth/signin?org=${ORG.slug}`);
      await page.getByLabel('Email', { exact: true }).fill(NEW_ADMIN.email);
      await page.getByLabel('Mot de passe', { exact: true }).fill(NEW_ADMIN.password);
      await page.getByRole('button', { name: 'Se connecter' }).click();
      await expect(page.getByText('Espace, email ou mot de passe incorrect')).toBeVisible();
      await expect(page).toHaveURL(/\/auth\/signin/);
      await evidence(page, testInfo, 'SAAS-05-reconnexion-refusee-03');
    } finally {
      // Réactivation (toujours, pour ne pas laisser l'association suspendue).
      await saMain.getByRole('button', { name: 'Réactiver l’association' }).click();
      await expect(superAdmin.getByText('Association réactivée')).toBeVisible();
    }
    await expect(saMain.getByText('Active').first()).toBeVisible();
    await evidence(superAdmin, testInfo, 'SAAS-05-association-reactivee-04');
    await superAdmin.context().close();

    // Révocation DÉFINITIVE : la session d'avant la suspension ne revit pas.
    const stale = await newWindow(browser, testInfo);
    await stale.context().addCookies(cookiesBefore);
    await stale.goto('/dashboard/admin');
    await stale.waitForURL(/\/auth\/signin/);
    await stale.context().close();

    // Réactivée : l'admin se reconnecte.
    await signIn(page, NEW_ADMIN);
    await rememberSession(page, NEW_ADMIN);
    await expect(page).toHaveURL(/\/dashboard\/admin$/);
    await evidence(page, testInfo, 'SAAS-05-reconnexion-apres-reactivation-05');
  });

  test('SAAS-06 — désactiver « Factures » chez asso-demo masque la rubrique chez elle seule', async ({
    page,
    browser,
  }, testInfo) => {
    const superAdmin = await newWindow(browser, testInfo);
    await loginAs(superAdmin, PERSONAS.superAdmin);
    await openOrganization(superAdmin, 'Association Démo');
    const invoicesSwitch = superAdmin
      .getByRole('main')
      .getByRole('switch', { name: 'Factures', exact: true });
    await expect(invoicesSwitch).toHaveAttribute('aria-checked', 'true');
    await invoicesSwitch.click();
    await expect(invoicesSwitch).toHaveAttribute('aria-checked', 'false');
    try {
      await invoicesSwitch.scrollIntoViewIfNeeded();
      await evidence(superAdmin, testInfo, 'SAAS-06-module-factures-desactive-01');

      // asso-demo : rubrique absente du menu, page indisponible.
      await loginAs(page, PERSONAS.demoAdmin);
      await page.goto('/dashboard/admin');
      await expect(navLink(page, 'Paiements')).toBeVisible();
      await expect(navLink(page, 'Factures')).toHaveCount(0);
      await evidence(page, testInfo, 'SAAS-06-menu-asso-demo-sans-factures-02');
      await page.goto('/dashboard/admin/invoices');
      await expect(page.getByText('Fonctionnalité indisponible')).toBeVisible();
      await evidence(page, testInfo, 'SAAS-06-factures-indisponibles-asso-demo-03');

      // alvm : inchangée.
      const alvm = await newWindow(browser, testInfo);
      await loginAs(alvm, PERSONAS.alvmAdmin);
      await alvm.goto('/dashboard/admin/invoices');
      await expect(navLink(alvm, 'Factures')).toBeVisible();
      await expect(alvm.getByText('Fonctionnalité indisponible')).toHaveCount(0);
      await expect(alvm.getByRole('main').getByText(/FAC-\d{4}-\d{4}/).first()).toBeVisible();
      await evidence(alvm, testInfo, 'SAAS-06-factures-alvm-inchangees-04');
      await alvm.context().close();
    } finally {
      await invoicesSwitch.click();
      await expect(invoicesSwitch).toHaveAttribute('aria-checked', 'true');
    }
    // Réactivé : la rubrique revient chez asso-demo (sans reconnexion).
    await page.reload();
    await expect(navLink(page, 'Factures')).toBeVisible();
    await expect(page.getByText('Fonctionnalité indisponible')).toHaveCount(0);
    await evidence(page, testInfo, 'SAAS-06-factures-reactivees-asso-demo-05');
    await superAdmin.context().close();
  });

  test(
    'SAAS-07 — le super admin n’a accès à aucune page métier',
    { tag: '@mobile' },
    async ({ page }, testInfo) => {
      await loginAs(page, PERSONAS.superAdmin);
      for (const url of [
        '/dashboard/admin',
        '/dashboard/admin/children',
        '/dashboard/admin/invoices',
        '/dashboard/staff/camps',
        '/dashboard/parent/invoices',
      ]) {
        await page.goto(url);
        await page.waitForURL(/\/dashboard\/super-admin$/);
      }
      const main = page.getByRole('main');
      await expect(main.getByRole('heading', { name: 'Associations' })).toBeVisible();
      await expect(page.getByText(/Dupont|FAC-\d{4}/)).toHaveCount(0);
      await evidence(page, testInfo, 'SAAS-07-pages-metier-redirigees-01');

      // Les procédures métier refusent aussi ce rôle (API, même session).
      const response = await page.request.get(
        `/api/trpc/children.list?input=${encodeURIComponent(JSON.stringify({ json: {} }))}`,
      );
      expect(response.status()).toBe(403);
      const body = await response.text();
      expect(body).toContain('FORBIDDEN');
      await testInfo.attach('SAAS-07-api-children-list', {
        body: `GET /api/trpc/children.list (session super admin) → HTTP ${response.status()}\n${body}`,
        contentType: 'text/plain',
      });
    },
  );

  test('SAAS-08 — numérotation par association : première facture = FAC-<année>-0001', async ({
    page,
    browser,
  }, testInfo) => {
    const year = new Date().getFullYear();
    // alvm a déjà émis des factures (recette ALVM) : une numérotation globale
    // donnerait un numéro supérieur à 0001 dans la nouvelle association.
    const alvm = await newWindow(browser, testInfo);
    await loginAs(alvm, PERSONAS.alvmAdmin);
    await alvm.goto('/dashboard/admin/invoices');
    await expect(alvm.getByRole('main').getByText(`FAC-${year}-0001`).first()).toBeVisible();
    await evidence(alvm, testInfo, 'SAAS-08-factures-alvm-01');
    await alvm.context().close();

    const last = `SAAS${TAG}`;
    const parentEmail = `famille-${RUN}@recette-saas.test`;
    const campName = `Camp recette SaaS ${RUN}`;
    await loginAs(page, NEW_ADMIN);
    await createCampType(page, 'Multi-activités');
    await createCamp(page, { name: campName, price: 12_000, startIn: 30, days: 3 });
    await createParent(page, { first: 'Famille', last, email: parentEmail });
    await createChild(page, { first: 'Noa', last, birth: '2017-05-05', parentEmail });
    await createRegistration(page, {
      parent: new RegExp(last, 'i'),
      child: { first: 'Noa', last },
      camp: campName,
    });
    await createInvoiceFromRegistration(page, new RegExp(last, 'i'), last);
    const number = await validateOpenInvoice(page);
    expect(number).toBe(`FAC-${year}-0001`);
    await expect(page.getByText(`Espace ${ORG.name}`)).toBeVisible();
    await evidence(page, testInfo, 'SAAS-08-premiere-facture-0001-02');
  });

  test('SEC-01 — hors navigateur : le back refuse toute requête sans secret interne (403)', async ({
    request,
  }, testInfo) => {
    const probes: string[] = [];
    const check = async (label: string, status: number, expected: number, body: string) => {
      probes.push(`${label} → HTTP ${status} ${body.slice(0, 120)}`);
      expect(status, label).toBe(expected);
    };

    const health = await request.get(`${BACK_URL}/api/health`);
    await check('GET /api/health (sonde publique)', health.status(), 200, await health.text());

    const input = encodeURIComponent(JSON.stringify({ json: { slug: 'alvm' } }));
    const trpc = await request.get(`${BACK_URL}/api/trpc/organizations.publicInfo?input=${input}`);
    await check('GET /api/trpc/… sans secret', trpc.status(), 403, await trpc.text());

    const forged = await request.get(`${BACK_URL}/api/trpc/organizations.publicInfo?input=${input}`, {
      headers: { 'x-internal-secret': 'f'.repeat(64) },
    });
    await check('GET /api/trpc/… secret forgé', forged.status(), 403, await forged.text());

    const credentials = await request.post(`${BACK_URL}/api/internal/auth/credentials`, {
      data: { organization: 'alvm', email: PERSONAS.alvmAdmin.email, password: 'x' },
    });
    await check(
      'POST /api/internal/auth/credentials sans secret',
      credentials.status(),
      403,
      await credentials.text(),
    );

    const document = await request.get(`${BACK_URL}/api/generate/child-profile/${'0'.repeat(8)}`);
    await check('GET /api/generate/… sans secret', document.status(), 403, await document.text());

    await testInfo.attach('SEC-01-back-secret-interne', {
      body: probes.join('\n'),
      contentType: 'text/plain',
    });
  });
});
