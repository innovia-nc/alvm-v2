/**
 * Outillage commun de la recette visuelle (CLAUDE.md InnovIA §6.6) :
 * personas, connexion par l'interface, sessions réutilisées, captures probantes.
 *
 * Aucune lecture de la base : tout ce que la recette prouve passe par l'écran
 * (ou par un fichier que l'écran fait télécharger, comme le FEC).
 */
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import {
  expect,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';

type Cookie = Parameters<BrowserContext['addCookies']>[0][number];

/** Mot de passe des comptes du seed (`alvm-back/scripts/seed.ts`). */
export const SEED_PASSWORD = process.env.E2E_SEED_PASSWORD ?? 'Test1234!Seed';

/**
 * Identifiant du passage, stable pour tout le run (posé par
 * `playwright.config.ts`, hérité par les workers — survit à leur redémarrage
 * après un échec).
 */
export const RUN = process.env.E2E_RUN_ID ?? Date.now().toString(36);

/**
 * Suffixe ALPHABÉTIQUE dérivé du run : les noms (enfant, parent) n'acceptent
 * que des lettres.
 */
export const TAG = RUN.replace(/[^a-z0-9]/gi, '')
  .split('')
  .map((c) => (/[0-9]/.test(c) ? 'abcdefghij'[Number(c)] : c))
  .join('')
  .toUpperCase();

export type Persona = {
  key: string;
  /** Identifiant d'espace ; absent = portail super admin. */
  org?: string;
  email: string;
  password: string;
};

export const PERSONAS = {
  superAdmin: { key: 'super-admin', email: 'superadmin@plateforme.test', password: SEED_PASSWORD },
  alvmAdmin: { key: 'alvm-admin', org: 'alvm', email: 'admin@alvm.test', password: SEED_PASSWORD },
  demoAdmin: {
    key: 'demo-admin',
    org: 'asso-demo',
    email: 'admin@asso-demo.test',
    password: SEED_PASSWORD,
  },
  alvmParentSeed: {
    key: 'alvm-martin',
    org: 'alvm',
    email: 'martin.dupont@familles.test',
    password: SEED_PASSWORD,
  },
  demoParentSeed: {
    key: 'demo-martin',
    org: 'asso-demo',
    email: 'martin.dupont@familles.test',
    password: SEED_PASSWORD,
  },
} satisfies Record<string, Persona>;

/** Dossier des captures probantes (`E2E_EVIDENCE_DIR`), sinon sorties du test. */
function evidenceDir(testInfo: TestInfo): string {
  const dir = process.env.E2E_EVIDENCE_DIR || testInfo.outputPath('evidence');
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Capture probante `<CRITERE>-<slug>-NN.png` (page entière), jointe au rapport
 * Playwright. Le suffixe `-mobile` distingue les captures du projet mobile.
 */
export async function evidence(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const mobile = testInfo.project.name === 'mobile';
  const file = path.join(evidenceDir(testInfo), `${name}${mobile ? '-mobile' : ''}.png`);
  // Laisser retomber les chargements, puis capturer depuis le haut de page :
  // une page défilée décale le menu et l'en-tête fixes dans la capture entière.
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.evaluate(() => window.scrollTo(0, 0));
  if (mobile) {
    // Format téléphone : aucun débordement horizontal.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `débordement horizontal de ${overflow}px (${name})`).toBeLessThanOrEqual(0);
  }
  await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
  await testInfo.attach(name, { path: file, contentType: 'image/png' });
}

/** Connexion par le formulaire (portail association ou super admin). */
export async function signIn(page: Page, persona: Persona): Promise<void> {
  if (persona.org) {
    await page.goto(`/auth/signin?org=${persona.org}`);
    await expect(page.getByLabel('Identifiant de l’espace')).toHaveValue(persona.org);
  } else {
    await page.goto('/auth/super-admin');
  }
  await page.getByLabel('Email', { exact: true }).fill(persona.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(persona.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL(/\/dashboard(\/|$)/, { timeout: 30_000 });
}

function storageFile(persona: Persona): string {
  const dir = path.resolve(__dirname, '../../../test-results/.auth', RUN);
  mkdirSync(dir, { recursive: true });
  return path.join(dir, `${persona.key}.json`);
}

/**
 * Connecte `page` sous `persona`. La session est ouverte UNE fois par run
 * (formulaire) puis réutilisée (cookies) : la limitation de débit
 * (10 connexions / compte / 15 min) compte aussi les connexions réussies.
 * Une session révoquée entre-temps est rouverte par le formulaire.
 */
export async function loginAs(page: Page, persona: Persona): Promise<void> {
  const file = storageFile(persona);
  if (existsSync(file)) {
    const state = JSON.parse(readFileSync(file, 'utf8')) as { cookies: Cookie[] };
    await page.context().clearCookies();
    await page.context().addCookies(state.cookies);
    await page.goto('/dashboard');
    if (!new URL(page.url()).pathname.startsWith('/auth')) return;
    rmSync(file, { force: true });
  }
  await page.context().clearCookies();
  await signIn(page, persona);
  await page.context().storageState({ path: file });
}

/** Enregistre la session ouverte par `signIn` pour les critères suivants. */
export async function rememberSession(page: Page, persona: Persona): Promise<void> {
  await page.context().storageState({ path: storageFile(persona) });
}

/**
 * Seconde fenêtre de navigation (autre session) avec les réglages du projet
 * courant (viewport, locale, fuseau, mobile…).
 */
export async function newWindow(browser: Browser, testInfo: TestInfo): Promise<Page> {
  const use = testInfo.project.use;
  const context = await browser.newContext({
    baseURL: use.baseURL,
    locale: use.locale,
    timezoneId: use.timezoneId,
    viewport: use.viewport,
    userAgent: use.userAgent,
    deviceScaleFactor: use.deviceScaleFactor,
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  return page;
}

/** Date `AAAA-MM-JJ` à `days` jours d'aujourd'hui (fuseau Nouméa). */
export function isoDateIn(days: number): string {
  const date = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Noumea' }).format(date);
}

/**
 * Ouvre un Select shadcn (combobox) identifié par son label, DANS le contenu
 * principal (la navigation latérale porte des libellés voisins : « Parents /
 * Clients »…), et choisit une option.
 */
export async function selectByLabel(
  page: Page,
  label: RegExp | string,
  option: RegExp | 'first',
): Promise<void> {
  await page
    .getByRole('main')
    .getByLabel(label, typeof label === 'string' ? { exact: true } : undefined)
    .click();
  const options = page.getByRole('option');
  if (option === 'first') await options.first().click();
  else await options.filter({ hasText: option }).first().click();
}

/** Recherche serveur d'une liste (déclenchée par « Entrée »). */
export async function searchList(page: Page, placeholder: RegExp, term: string): Promise<void> {
  const field = page.getByRole('main').getByPlaceholder(placeholder);
  await field.fill(term);
  await field.press('Enter');
}

/** Ouvre la fiche d'une ligne de liste via son menu d'actions (« Voir détails »). */
export async function openRowDetails(page: Page, row: Locator): Promise<void> {
  await row.getByRole('button', { name: /menu/i }).click();
  await page.getByRole('menuitem', { name: 'Voir détails' }).click();
}

/** Montant XPF tel qu'affiché (`25 000`, espace fine insécable ou non). */
export function xpf(amount: number): RegExp {
  const grouped = amount.toLocaleString('en-US').replace(/,/g, '[\\s\\u00a0\\u202f]?');
  return new RegExp(grouped);
}
