const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Chemin d'un objet du stockage, cloisonné par association :
 * `organizations/<uuid>/<relatif>`. Tous les fichiers d'un tenant vivent sous
 * son préfixe — un nom de pièce identique dans deux associations
 * (`FAC-2026-0001`) ne peut pas écraser l'objet de l'autre.
 */
export function tenantBlobPath(organizationId: string, relativePath: string): string {
  if (!UUID.test(organizationId)) throw new Error('Organisation invalide pour le stockage.');
  const relative = relativePath.replace(/^\/+/, '');
  if (!relative || relative.split('/').some((segment) => segment === '..' || segment === ''))
    throw new Error('Chemin de stockage invalide.');
  return `organizations/${organizationId}/${relative}`;
}

/** Vrai si `url` désigne un objet du stockage appartenant au tenant. */
export function isTenantBlobUrl(url: string, organizationId: string): boolean {
  if (!URL.canParse(url)) return false;
  const parsed = new URL(url);
  return (
    parsed.protocol === 'https:' &&
    parsed.hostname.endsWith('.blob.vercel-storage.com') &&
    parsed.pathname.startsWith(`/organizations/${organizationId}/`)
  );
}
