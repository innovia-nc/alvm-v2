/**
 * Helper centralisé pour récupérer les settings (organisation + mentions documents)
 * nécessaires à la génération des PDFs ALVM.
 *
 * Une seule requête Prisma pour les 2 catégories. Retourne une structure
 * typée prête à être passée au composant `<PDFFooter>`.
 *
 * Fallbacks sûrs : `org.name` au minimum `'ALVM'` (le pied de page doit
 * toujours afficher au moins le nom). Les autres champs sont vides/undefined.
 */

import type { OrgInfo } from '@/lib/pdf/shared/pdf-footer';

// ============================================================================
// TYPES
// ============================================================================

interface PdfSettingsData {
  org: OrgInfo;
  mentions: {
    invoice: string;
    creditNote: string;
    childProfile: string;
    staffProfile: string;
    attendance: string;
  };
}

/** Interface minimale Prisma : suffit pour les tests, compatible client étendu */
interface HasAppSettingFindMany {
  appSetting: {
    findMany: (args: {
      where: { category: { in: string[] } };
      select: { category: true; key: true; value: true };
    }) => Promise<Array<{ category: string; key: string; value: string | null }>>;
  };
}

// ============================================================================
// HELPERS INTERNES
// ============================================================================

/** Parse un setting JSON-stringified (cf. router settings.update) */
function parseStringSetting(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'string' && parsed.trim() ? parsed : undefined;
  } catch {
    // Valeur stockée en clair (legacy) — on prend telle quelle si non vide
    return raw.trim() ? raw : undefined;
  }
}

/** Construit une Map<key, parsedString> à partir des rows d'une catégorie */
function categoryMap(
  rows: Array<{ category: string; key: string; value: string | null }>,
  category: string,
): Map<string, string | undefined> {
  const map = new Map<string, string | undefined>();
  for (const row of rows) {
    if (row.category === category) {
      map.set(row.key, parseStringSetting(row.value));
    }
  }
  return map;
}

// ============================================================================
// API PUBLIQUE
// ============================================================================

/**
 * Charge toutes les settings nécessaires aux PDFs en UNE requête.
 *
 * @param prisma client Prisma (compatible client étendu soft-delete)
 * @returns données prêtes à passer aux composants PDF
 */
export async function getPdfSettings(
  prisma: HasAppSettingFindMany,
): Promise<PdfSettingsData> {
  const rows = await prisma.appSetting.findMany({
    where: { category: { in: ['organization', 'documents'] } },
    select: { category: true, key: true, value: true },
  });

  const org = categoryMap(rows, 'organization');
  const docs = categoryMap(rows, 'documents');

  const orgInfo: OrgInfo = {
    name: org.get('name') ?? 'ALVM',
    shortName: org.get('short_name'),
    address: org.get('address'),
    city: org.get('city'),
    postalCode: org.get('postal_code'),
    country: org.get('country'),
    phone: org.get('phone'),
    email: org.get('email'),
    ridet: org.get('ridet'),
    ape: org.get('ape'),
    legalForm: org.get('legal_form'),
  };

  return {
    org: orgInfo,
    mentions: {
      invoice: docs.get('invoice_footer') ?? '',
      creditNote: docs.get('credit_note_footer') ?? '',
      childProfile: docs.get('child_form_footer') ?? '',
      staffProfile: docs.get('staff_profile_footer') ?? '',
      attendance: docs.get('attendance_footer') ?? '',
    },
  };
}
