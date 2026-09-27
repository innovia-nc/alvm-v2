import { redirect } from 'next/navigation';
import {
  ORGANIZATION_SLUG_PATTERN,
  normalizeOrganizationSlug,
} from '@alvm/shared/organization-slug';

/**
 * Lien d'accès d'une association (`/o/<identifiant>`), à communiquer aux
 * familles et au personnel : ouvre la connexion avec l'espace prérempli.
 */
export default async function OrganizationEntryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const slug = normalizeOrganizationSlug((await params).slug);
  redirect(ORGANIZATION_SLUG_PATTERN.test(slug) ? `/auth/signin?org=${slug}` : '/auth/signin');
}
