/**
 * Parcours métier pilotés par l'interface (espace ADMIN d'une association),
 * partagés par la recette ALVM et la recette multi-tenant (SAAS-08 rejoue la
 * chaîne camp → famille → inscription → facture dans une association neuve).
 *
 * Les champs sont cherchés dans le contenu principal : la navigation latérale
 * porte des libellés voisins (« Parents / Clients », « Factures »…).
 */
import { expect, type Page } from '@playwright/test';
import { isoDateIn, openRowDetails, searchList, selectByLabel } from './recette';

const ADMIN = '/dashboard/admin';

/** Identifiant (UUID) du dernier segment d'URL de la page courante. */
export function idFromUrl(page: Page): string {
  const id = new URL(page.url()).pathname.split('/').filter(Boolean).pop() ?? '';
  expect(id, `identifiant attendu dans ${page.url()}`).toMatch(/^[0-9a-f-]{36}$/);
  return id;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function createCampType(page: Page, name: string): Promise<void> {
  await page.goto(`${ADMIN}/settings/camp-types`);
  await page.getByRole('button', { name: 'Ajouter un type de camp' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Nom/).fill(name);
  await dialog.getByRole('button', { name: 'Créer', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('main').getByText(name, { exact: true }).first()).toBeVisible();
}

export type CampInput = {
  name: string;
  price: number;
  /** Premier jour, en jours à partir d'aujourd'hui. */
  startIn: number;
  days: number;
  campType?: RegExp;
};

/** Crée un camp PUBLIÉ puis ouvre sa fiche ; renvoie son identifiant. */
export async function createCamp(page: Page, camp: CampInput): Promise<string> {
  await page.goto(`${ADMIN}/camps/new`);
  const main = page.getByRole('main');
  await main.getByLabel(/Nom du camp/).fill(camp.name);
  await selectByLabel(page, /Type de camp/, camp.campType ?? 'first');
  await main.getByLabel(/^Description/).fill(`Camp de recette automatisée — ${camp.days} jours.`);
  await main.getByLabel(/Lieu principal/).fill('Centre de loisirs de Nouméa');
  await main.getByLabel(/Date de début/).fill(isoDateIn(camp.startIn));
  await main.getByLabel(/Date de fin/).fill(isoDateIn(camp.startIn + camp.days - 1));
  await main.getByLabel(/Date limite d'inscription/).fill(isoDateIn(camp.startIn - 7));
  await main.getByLabel(/Capacité maximale/).fill('30');
  await main.getByLabel(/Prix total du camp/).fill(String(camp.price));
  await selectByLabel(page, /Statut de publication/, /Publié/);
  await main.getByRole('button', { name: 'Créer le camp' }).click();
  await page.waitForURL(new RegExp(`${ADMIN}/camps$`));
  return openCamp(page, camp.name);
}

/** Retrouve un camp par recherche dans la liste et ouvre sa fiche. */
export async function openCamp(page: Page, name: string): Promise<string> {
  if (!new URL(page.url()).pathname.endsWith(`${ADMIN}/camps`)) await page.goto(`${ADMIN}/camps`);
  await searchList(page, /Rechercher par nom ou lieu/, name);
  await page.getByRole('main').getByRole('link', { name }).first().click();
  await page.waitForURL(new RegExp(`${ADMIN}/camps/[0-9a-f-]{36}$`));
  return idFromUrl(page);
}

export type ParentInput = {
  first: string;
  last: string;
  email: string;
  password?: string;
  postalCode?: string;
};

/** Crée un parent (code postal facultatif) ; renvoie l'identifiant de sa fiche. */
export async function createParent(page: Page, parent: ParentInput): Promise<string> {
  await page.goto(`${ADMIN}/users/parents/new`);
  const main = page.getByRole('main');
  await main.getByLabel('Prénom', { exact: true }).fill(parent.first);
  await main.getByLabel('Nom', { exact: true }).fill(parent.last);
  await main.getByLabel('Email', { exact: true }).fill(parent.email);
  await main.getByLabel('Téléphone Mobile').fill('+687 12 34 56');
  await main.getByLabel('Ville', { exact: true }).fill('Nouméa');
  if (parent.postalCode) await main.getByLabel('Code postal').fill(parent.postalCode);
  if (parent.password) await main.getByLabel(/^Mot de passe/).fill(parent.password);
  await main.getByRole('button', { name: 'Créer le parent' }).click();
  await page.waitForURL(new RegExp(`${ADMIN}/users/parents/[0-9a-f-]{36}$`));
  return idFromUrl(page);
}

export type ChildInput = {
  first: string;
  last: string;
  birth: string;
  gender: 'Fille' | 'Garçon';
  parentEmail: string;
};

/**
 * Crée un enfant rattaché au parent désigné par son EMAIL (unique) : cibler
 * un homonyme donnerait un faux vert (défaut trouvé par la recette v2.0.1).
 * La carte du parent sélectionné doit afficher cet email avant l'envoi.
 */
export async function createChild(page: Page, child: ChildInput): Promise<void> {
  await page.goto(`${ADMIN}/children/new`);
  const main = page.getByRole('main');
  await main.getByRole('button', { name: /Ajouter un parent/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder(/Rechercher/).fill(child.parentEmail);
  const card = dialog
    .locator('div')
    .filter({ hasText: child.parentEmail })
    .filter({ has: page.getByRole('button', { name: 'Ajouter', exact: true }) })
    .last();
  await card.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(main.getByText('1 parent sélectionné')).toBeVisible();
  await expect(main.getByText(child.parentEmail)).toBeVisible();

  await main.getByLabel(/^Prénom/).fill(child.first);
  await main.getByLabel(/^Nom \*/).fill(child.last);
  await main.getByLabel(/Date de naissance/).fill(child.birth);
  await selectByLabel(page, /Genre/, new RegExp(`^${child.gender}$`));
  await main.getByRole('button', { name: /Créer l'enfant/ }).click();
  await page.waitForURL(new RegExp(`${ADMIN}/children$`));
}

/** Ouvre la fiche d'un enfant depuis la liste (recherche par nom). */
export async function openChild(page: Page, first: string, last: string): Promise<string> {
  await page.goto(`${ADMIN}/children`);
  await searchList(page, /Rechercher par nom ou parent/, last);
  const row = page.getByRole('main').getByRole('row', { name: new RegExp(`${first} ${last}`) });
  await openRowDetails(page, row.first());
  await page.waitForURL(new RegExp(`${ADMIN}/children/[0-9a-f-]{36}$`));
  return idFromUrl(page);
}

export type RegistrationInput = {
  parent: RegExp;
  child: { first: string; last: string };
  camp: string;
};

/** Inscrit un enfant à un camp, statut initial « Confirmée » (facturable). */
export async function createRegistration(page: Page, input: RegistrationInput): Promise<void> {
  await page.goto(`${ADMIN}/registrations/new`);
  const main = page.getByRole('main');
  await selectByLabel(page, 'Parent', input.parent);
  const childField = main.getByPlaceholder(/Rechercher un enfant/i);
  await childField.click();
  await childField.fill(input.child.first);
  await main
    .getByRole('button', { name: new RegExp(`${input.child.first}.*${input.child.last}`, 'i') })
    .first()
    .click();
  await selectByLabel(page, 'Camp', new RegExp(escapeRegExp(input.camp)));
  // Seule une inscription CONFIRMED + UNPAID est facturable.
  await selectByLabel(page, 'Statut initial', /Confirmée/);
  await main.getByRole('button', { name: /Créer l'inscription/ }).click();
  await page.waitForURL(new RegExp(`${ADMIN}/registrations$`));
}

/** Facture l'inscription non payée d'un parent ; renvoie l'identifiant de la facture. */
export async function createInvoiceFromRegistration(
  page: Page,
  parent: RegExp,
  searchTerm: string,
): Promise<string> {
  await page.goto(`${ADMIN}/invoices/new`);
  const main = page.getByRole('main');
  await selectByLabel(page, 'Parent', parent);
  await expect(main.getByText('Inscriptions non payées')).toBeVisible();
  await main.getByRole('checkbox').first().check();
  await main.getByRole('button', { name: /Ajouter \d+ inscription/ }).click();
  await main.getByRole('button', { name: 'Créer la facture' }).click();
  await page.waitForURL(new RegExp(`${ADMIN}/invoices$`));
  return openInvoice(page, searchTerm);
}

/** Retrouve une facture par recherche (numéro, nom, email) et ouvre sa fiche. */
export async function openInvoice(page: Page, searchTerm: string): Promise<string> {
  await page.goto(`${ADMIN}/invoices`);
  await searchList(page, /Rechercher par numéro, nom ou email/, searchTerm);
  const row = page.getByRole('main').getByRole('row').filter({ hasText: searchTerm });
  await openRowDetails(page, row.first());
  await page.waitForURL(new RegExp(`${ADMIN}/invoices/[0-9a-f-]{36}$`));
  return idFromUrl(page);
}

/** Numéro `FAC-AAAA-NNNN` de la facture ouverte (titre de la fiche). */
export async function openInvoiceNumber(page: Page): Promise<string> {
  const heading = page.getByRole('main').getByRole('heading', { level: 1 }).first();
  await expect(heading).toContainText(/FAC-\d{4}-\d{4,}/);
  return /FAC-\d{4}-\d{4,}/.exec(await heading.innerText())![0];
}

/** Valide (DRAFT → SENT) la facture ouverte ; renvoie son numéro. */
export async function validateOpenInvoice(page: Page): Promise<string> {
  const main = page.getByRole('main');
  await main.getByRole('button', { name: 'Valider la facture' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: /^Valider$/ })
    .click();
  await expect(main.getByText('Émise').first()).toBeVisible();
  return openInvoiceNumber(page);
}
