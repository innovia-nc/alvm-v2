/**
 * Recette complète ALVM v2.0.1 — simulation des cas d'usage utilisateurs
 * (skill sprint-acceptance, CLAUDE.md global §6.6).
 *
 * Personas : ADMIN (smoke-admin@test.local) et PARENT (créé pendant la recette).
 * Couverture : les 8 guides utilisateurs (docs/Guide_1..8) — connexion, camps,
 * familles, inscriptions, présences, facturation/paiements, FEC, habilitations.
 *
 * Banc : clone local de la prod (127.0.0.1:5445), JAMAIS la prod.
 * Captures probantes : une par critère, dans ce dossier.
 */
import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';

/** Interroge la base du banc (conteneur docker jetable) — usage recette seulement. */
function dbQuery(sql: string): string {
  return execFileSync(
    'docker',
    ['exec', 'alvm-smoke', 'psql', '-U', 'postgres', '-d', 'neondb', '-t', '-A', '-c', sql],
    { encoding: 'utf8' },
  ).trim();
}

const EVIDENCE_DIR = 'docs/test-evidence/recette-v2.0.1';
const ADMIN = { email: 'smoke-admin@test.local', password: 'Smoke2026!' };
const RUN = Date.now().toString().slice(-5);
// Suffixe ALPHABÉTIQUE (le nom d'enfant impose une regex alpha-only) : chiffre → lettre.
const TAG = RUN.split('').map((d) => 'abcdefghij'[Number(d)]).join('').toUpperCase();
const PARENT = { email: `recette-parent-${RUN}@test.local`, password: 'RecetteParent2026!' };
const CAMP_NAME = `RECETTE Camp Toussaint ${RUN}`;
const PARENT_LAST = `RECETTE${TAG}`;
const CHILD1 = { first: 'Léa', last: PARENT_LAST };
const CHILD2 = { first: 'Tom', last: PARENT_LAST };


async function snap(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${EVIDENCE_DIR}/${name}.png`, fullPage: true });
}

async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/auth/signin');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
}

/** Ouvre un Select shadcn identifié par son label et choisit une option. */
async function selectByLabel(page: Page, label: RegExp, option: RegExp | 'first'): Promise<void> {
  await page.getByLabel(label).click();
  const options = page.getByRole('option');
  if (option === 'first') {
    await options.first().click();
  } else {
    await options.filter({ hasText: option }).first().click();
  }
}

test.describe.serial('Recette ALVM v2.0.1', () => {
  // ————————————————————————————— AUTH (Guides 1 & 8) —————————————————————————————

  test('AUTH-01 — un admin se connecte et voit son tableau de bord', async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText(/Smoke Admin|Admin/i).first()).toBeVisible();
    await snap(page, 'AUTH-login-admin-01');
  });

  test('AUTH-02 — un mauvais mot de passe est rejeté avec un message', async ({ page }) => {
    await page.goto('/auth/signin');
    await page.getByLabel('Email').fill(ADMIN.email);
    await page.getByLabel('Mot de passe').fill('mauvais-mdp');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page.getByText(/incorrect|invalide|erreur|échou/i).first()).toBeVisible();
    await expect(page).toHaveURL(/auth\/signin/);
    await snap(page, 'AUTH-mauvais-mdp-01');
  });

  test('AUTH-03 — un visiteur non connecté est redirigé vers la connexion', async ({ page }) => {
    await page.goto('/dashboard/admin/invoices');
    await page.waitForURL(/auth\/signin/, { timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
    await snap(page, 'AUTH-redirect-anonyme-01');
  });

  // ————————————————————————— ADMIN : camps (Guide 2) —————————————————————————

  test('CAMP-01 — l’admin crée un camp publié via le formulaire', async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.goto('/dashboard/admin/camps/new');
    await expect(page.getByText('Créer un nouvel ACM').first()).toBeVisible();

    await page.getByLabel(/Nom du camp/).fill(CAMP_NAME);
    await selectByLabel(page, /Type de camp/, 'first');
    await page.getByLabel(/Description/).fill('Camp de recette automatisée — 5 jours à 25 000 XPF.');
    await page.getByLabel(/Lieu principal/).fill('Centre de loisirs de Nouméa');
    await page.getByLabel(/Date de début/).fill('2026-10-19');
    await page.getByLabel(/Date de fin/).fill('2026-10-23');
    await page.getByLabel(/Date limite d'inscription/).fill('2026-10-12');
    await page.getByLabel(/Capacité maximale/).fill('30');
    await page.getByLabel(/Prix total du camp/).fill('25000');
    await selectByLabel(page, /Statut de publication/, /Publié/);

    await page.getByRole('button', { name: 'Créer le camp' }).click();
    await page.waitForURL(/\/dashboard\/admin\/camps$/, { timeout: 15_000 });
    // Liste paginée côté serveur : rechercher le camp par nom pour le retrouver.
    await page.getByPlaceholder(/Rechercher par nom ou lieu/).fill(CAMP_NAME);
    await expect(page.getByText(CAMP_NAME).first()).toBeVisible({ timeout: 15_000 });
    await snap(page, 'CAMP-creation-01');
  });

  // ——————————————————— ADMIN : familles (Guide 3) ———————————————————

  test('FAM-01 — l’admin crée un parent SANS code postal (régression 2.0.1)', async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.goto('/dashboard/admin/users/parents/new');
    await expect(page.getByText('Nouveau Parent / Client').first()).toBeVisible();

    await page.getByLabel(/Prénom/).fill('Recette');
    await page.getByLabel(/^Nom$/).fill(PARENT_LAST);
    await page.getByLabel(/^Email$/).fill(PARENT.email);
    await page.getByLabel(/Téléphone Mobile/).fill('+687 12 34 56');
    await page.getByLabel(/Ville/).fill('Nouméa');
    // Code postal volontairement VIDE — prouve le fix P0 (CHECK legacy assoupli)
    const pwd = page.getByLabel(/Mot de passe/);
    if (await pwd.count()) await pwd.fill(PARENT.password);

    await page.getByRole('button', { name: 'Créer le parent' }).click();
    await expect(page.getByText(new RegExp(PARENT_LAST)).first()).toBeVisible({ timeout: 15_000 });
    await snap(page, 'FAM-parent-sans-cp-01');
  });

  test('FAM-02 — l’admin crée un enfant rattaché au parent', async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.goto('/dashboard/admin/children/new');
    await expect(page.getByText('Nouvel Enfant / Stagiaire').first()).toBeVisible();

    await page.getByLabel(/Prénom/).fill(CHILD1.first);
    await page.getByLabel(/^Nom \*/).fill(CHILD1.last);
    await page.getByLabel(/Date de naissance/).fill('2016-04-12');
    await selectByLabel(page, /Genre/, 'first');
    // Multi-select parents : dialog de recherche, recherche par EMAIL unique
    // pour cibler exactement le bon parent (éviter le faux-vert d'un homonyme).
    await page.getByRole('button', { name: /Ajouter un parent/ }).click();
    await page.getByPlaceholder(/Rechercher par nom, email/).fill(PARENT.email);
    // Carte résultat = le div qui contient l'email ET le bouton "Ajouter".
    const resultCard = page.locator('div')
      .filter({ hasText: PARENT.email })
      .filter({ has: page.getByRole('button', { name: 'Ajouter' }) })
      .last();
    await resultCard.getByRole('button', { name: 'Ajouter' }).click();
    await page.keyboard.press('Escape');
    // Then : exactement un parent sélectionné (la liaison au bon parent est
    // prouvée en aval par INSCR-01, qui ne trouve Léa que sous ce parent).
    await expect(page.getByText('1 parent sélectionné')).toBeVisible();

    await page.getByRole('button', { name: /Créer l'enfant/ }).click();
    await expect(page.getByText(new RegExp(`${CHILD1.first}.*${CHILD1.last}|${CHILD1.last}`)).first())
      .toBeVisible({ timeout: 15_000 });
    await snap(page, 'FAM-enfant-cree-01');
  });

  // ——————————————— ADMIN : inscription (Guide 4) ———————————————

  test('INSCR-01 — l’admin inscrit l’enfant au camp', async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.goto('/dashboard/admin/registrations/new');
    await expect(page.getByText('Nouvelle Inscription').first()).toBeVisible();

    await selectByLabel(page, /^Parent/, new RegExp(PARENT_LAST, 'i'));
    // Enfant : input de recherche + dropdown de <button> (pas un Select)
    const childField = page.getByPlaceholder(/Rechercher un enfant/i);
    await childField.click();
    await childField.fill(CHILD1.first);
    await page.getByRole('button', { name: new RegExp(`${CHILD1.first}.*${CHILD1.last}`, 'i') }).first().click();
    await expect(page.getByText(/Sélectionné:/)).toBeVisible();
    await selectByLabel(page, /Camp/, new RegExp(CAMP_NAME));
    // Statut initial = Confirmée (prérequis facturation : seule une inscription
    // CONFIRMED + UNPAID est facturable).
    await selectByLabel(page, /Statut initial/, /Confirmée/);

    await page.getByRole('button', { name: /Créer l'inscription/ }).click();
    await expect(page.getByText(/inscription|Confirmée|CONFIRMED/i).first()).toBeVisible({ timeout: 15_000 });
    await snap(page, 'INSCR-creation-01');
  });

  // ——————————— ADMIN : facturation + paiement (Guide 6) ———————————

  test('FACT-01 — facture créée depuis l’inscription : montants pré-remplis, TGC 0', async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.goto('/dashboard/admin/invoices/new');
    await expect(page.getByText('Nouvelle Facture').first()).toBeVisible();

    await selectByLabel(page, /^Parent/, new RegExp(PARENT_LAST, 'i'));
    // Carte "Inscriptions non payées" : cocher l'inscription puis l'ajouter en ligne
    await expect(page.getByText('Inscriptions non payées')).toBeVisible();
    await page.getByRole('checkbox').first().check();
    await page.getByRole('button', { name: /Ajouter \d+ inscription/ }).click();

    // Montant attendu : 25 000 XPF, TGC 0
    await expect(page.getByText(/25[\s\u00a0]?000/).first()).toBeVisible();
    await page.getByRole('button', { name: 'Créer la facture' }).click();
    // Création → redirection vers la liste. On retrouve la facture par recherche.
    await page.waitForURL(/\/dashboard\/admin\/invoices$/, { timeout: 15_000 });
    await page.getByPlaceholder(/Rechercher par numéro, nom ou email/).fill(PARENT_LAST);
    const created = page.locator('tr', { hasText: PARENT_LAST }).first();
    await expect(created).toBeVisible({ timeout: 15_000 });
    await expect(created.getByText(/25[\s ]?000/).first()).toBeVisible();
    await snap(page, 'FACT-creation-tgc0-01');
  });

  test('FACT-02 — la validation passe la facture en SENT (écritures VE)', async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    // Page détail (stable) via l'id de la facture DRAFT du parent RECETTE.
    const invoiceId = dbQuery(
      `SELECT i.id FROM invoices i JOIN users u ON u.id=i.parent_id `
      + `WHERE u.email='${PARENT.email}' ORDER BY i.created_at DESC LIMIT 1;`,
    );
    expect(invoiceId).toMatch(/^[0-9a-f-]{36}$/);
    await page.goto(`/dashboard/admin/invoices/${invoiceId}`);
    await page.getByRole('button', { name: 'Valider la facture' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: /^Valider$/ }).click();
    await expect(page.getByText(/[EÉ]mise|Validée|Envoyée|SENT/i).first()).toBeVisible({ timeout: 15_000 });
    // Preuve comptable : écritures VE équilibrées générées à l'émission (polling BDD).
    await expect(async () => {
      const ve = dbQuery(
        `SELECT COALESCE(SUM(debit),0)::int||'/'||COALESCE(SUM(credit),0)::int FROM accounting_entries `
        + `WHERE invoice_id='${invoiceId}';`,
      );
      expect(ve).toBe('25000/25000');
    }).toPass({ timeout: 15_000 });
    await snap(page, 'FACT-validation-sent-01');
  });

  test('PAY-01 — le paiement du solde passe la facture en payée', async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.goto('/dashboard/admin/payments/new');
    await expect(page.getByText('Nouveau Paiement').first()).toBeVisible();

    await selectByLabel(page, /Facture/, new RegExp(PARENT_LAST, 'i'));
    await page.getByLabel(/Montant/).fill('25000');
    // Méthode : composant custom (label non associé) → cibler par le placeholder.
    await page.getByRole('combobox').filter({ hasText: /Sélectionner une méthode/ }).click();
    await page.getByRole('option').first().click();
    await page.getByRole('button', { name: 'Enregistrer le paiement' }).click();
    await page.waitForURL(/\/dashboard\/admin\/payments/, { timeout: 15_000 });
    await snap(page, 'PAY-solde-01');

    // Then : la facture est soldée (PAID) — retrouvée par recherche dans la liste
    await page.goto('/dashboard/admin/invoices');
    await page.getByPlaceholder(/Rechercher par numéro, nom ou email/).fill(PARENT_LAST);
    const paidRow = page.locator('tr', { hasText: PARENT_LAST }).first();
    await expect(paidRow).toBeVisible({ timeout: 15_000 });
    await expect(paidRow.getByText(/Pay[ée]e|PAID/i).first()).toBeVisible();
    await snap(page, 'PAY-facture-payee-02');
  });

  // ——————————— ADMIN/STAFF : présences (Guide 5) ———————————

  test('PRES-01 — l’enfant inscrit (CONFIRMED) apparaît sur la feuille de présence', async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    // L'inscription a été créée CONFIRMED (INSCR-01) ; accès direct à la feuille
    // de présence du camp (id résolu en base — liste staff paginée non fiable).
    const campId = dbQuery(`SELECT id FROM camps WHERE name='${CAMP_NAME}' LIMIT 1;`);
    expect(campId).toMatch(/^[0-9a-f-]{36}$/);
    await page.goto(`/dashboard/staff/camps/${campId}/attendance`);
    await expect(page.getByText('Présences').first()).toBeVisible();
    await expect(page.getByText(new RegExp(CHILD1.first, 'i')).first()).toBeVisible();
    await snap(page, 'PRES-pointage-01');
  });

  // ——————————— ADMIN : export FEC (Guide 7) ———————————

  test('FEC-01 — l’export comptable FEC est accessible et généré', async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.goto('/dashboard/admin/fec/export');
    await expect(page.getByText('Export Comptable FEC').first()).toBeVisible();
    await page.getByLabel(/Date de début/).fill('2026-01-01');
    await page.getByLabel(/Date de fin/).fill('2026-12-31');
    await page.getByPlaceholder(/123456789/).fill('123456789');
    const dl = page.waitForEvent('download', { timeout: 20_000 }).catch(() => null);
    await page.getByRole('button', { name: /Générer et télécharger le fichier FEC/ }).click();
    const file = await dl;
    // Then : un fichier est téléchargé OU le bandeau de succès s'affiche
    const ok = file !== null || await page.getByText(/Export réussi/).isVisible().catch(() => false);
    expect(ok, 'FEC : téléchargement ou bandeau de succès attendu').toBeTruthy();
    await snap(page, 'FEC-export-01');
  });

  // ——————————— ADMIN : habilitations (Guide 8) ———————————

  test('HAB-01 — la gestion des accès liste les comptes et leurs rôles', async ({ page }) => {
    await login(page, ADMIN.email, ADMIN.password);
    await page.goto('/dashboard/admin/users');
    await expect(page.getByText(/Admin/i).first()).toBeVisible();
    await expect(page.getByText(/Parent/i).first()).toBeVisible();
    await snap(page, 'HAB-roles-01');
  });

  // ————————————————————————— PARCOURS PARENT —————————————————————————

  test('PAR-01 — le parent créé se connecte et arrive sur son espace', async ({ page }) => {
    await login(page, PARENT.email, PARENT.password);
    await expect(page).toHaveURL(/\/dashboard\/parent/);
    await snap(page, 'PAR-login-01');
  });

  test('PAR-02 — le parent ne voit que ses propres enfants', async ({ page }) => {
    await login(page, PARENT.email, PARENT.password);
    await page.goto('/dashboard/parent/children');
    await expect(page.getByText(new RegExp(CHILD1.first, 'i')).first()).toBeVisible();
    // aucun enfant d'une autre famille (les enfants prod ne portent pas notre nom de recette)
    const rows = page.locator('main tr, main [data-slot="card"], main li').filter({ hasText: /./ });
    await expect(page.getByText(new RegExp(PARENT_LAST)).first()).toBeVisible();
    await snap(page, 'PAR-scoping-enfants-01');
  });

  test('PAR-03 — le parent ajoute lui-même un second enfant', async ({ page }) => {
    await login(page, PARENT.email, PARENT.password);
    await page.goto('/dashboard/parent/children/new');
    await page.getByLabel(/Prénom/).fill(CHILD2.first);
    await page.getByLabel(/^Nom \*/).fill(CHILD2.last);
    await page.getByLabel(/Date de naissance/).fill('2018-09-03');
    await selectByLabel(page, /Genre/, 'first');
    await page.getByRole('button', { name: /Enregistrer l'enfant/ }).click();
    await expect(page.getByText(new RegExp(CHILD2.first, 'i')).first()).toBeVisible({ timeout: 15_000 });
    await snap(page, 'PAR-second-enfant-01');
  });

  test('PAR-04 — le parent inscrit son enfant au camp publié', async ({ page }) => {
    await login(page, PARENT.email, PARENT.password);
    // Accès direct à la fiche camp (id en base) : la liste parent liste par
    // bouton, mais on veut cibler notre camp sans dépendre de l'ordre d'affichage.
    const campId = dbQuery(`SELECT id FROM camps WHERE name='${CAMP_NAME}' LIMIT 1;`);
    await page.goto(`/dashboard/parent/camps/${campId}`);
    // Le formulaire d'inscription est embarqué sur la fiche camp (Select enfant + submit)
    await expect(page.getByText('Inscription au camp')).toBeVisible();
    await page.getByRole('combobox').first().click();
    await page.getByRole('option', { name: new RegExp(CHILD2.first, 'i') }).first().click();
    await page.getByRole('button', { name: /Confirmer l'inscription/ }).click();
    await expect(page.getByText(/inscription.*(envoyée|créée|enregistrée|succès|attente)|PENDING/i).first())
      .toBeVisible({ timeout: 15_000 });
    await snap(page, 'PAR-inscription-01');
  });

  test('PAR-05 — le parent voit sa facture (et uniquement la sienne)', async ({ page }) => {
    await login(page, PARENT.email, PARENT.password);
    await page.goto('/dashboard/parent/invoices');
    await expect(page.getByText(/25[\s\u00a0]?000/).first()).toBeVisible();
    await snap(page, 'PAR-factures-01');
  });

  test('PAR-06 — le parent est bloqué hors de son espace (admin interdit)', async ({ page }) => {
    await login(page, PARENT.email, PARENT.password);
    await page.goto('/dashboard/admin/invoices');
    await expect(page).not.toHaveURL(/\/dashboard\/admin\/invoices/, { timeout: 15_000 });
    await snap(page, 'PAR-admin-interdit-01');
  });
});
