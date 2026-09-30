/**
 * Identifiant public d'une association (« espace ») saisi à la connexion :
 * minuscules, chiffres et tirets, 3 à 40 caractères, sans tiret en bordure.
 * Même règle que la contrainte `organizations_slug_format` en base.
 */
export const ORGANIZATION_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

export function normalizeOrganizationSlug(value: string): string {
  return value.trim().toLowerCase();
}

/** Clé de stockage local du dernier espace utilisé (confort, jamais une autorisation). */
export const LAST_ORGANIZATION_KEY = 'alvm:last-organization';
