export const FEATURES = {
  application: {
    label: 'Application',
    description: 'Accès à tous les espaces métier. Le super admin conserve son accès.',
  },
  camps: { label: 'Camps / ACM', description: 'Catalogue et gestion des camps.' },
  registrations: {
    label: 'Inscriptions',
    description: 'Consultation et gestion des inscriptions.',
  },
  children: { label: 'Enfants / stagiaires', description: 'Fiches des participants.' },
  parents: { label: 'Parents / clients', description: 'Gestion des familles et clients.' },
  staff: { label: 'Personnel', description: 'Fiches du personnel.' },
  users: { label: 'Comptes et habilitations', description: 'Gestion des comptes utilisateurs.' },
  attendances: { label: 'Présences', description: 'Pointage et listes de présence.' },
  invoices: { label: 'Factures', description: 'Consultation et gestion des factures.' },
  payments: { label: 'Paiements', description: 'Gestion des règlements.' },
  creditNotes: { label: 'Avoirs', description: 'Consultation et gestion des avoirs.' },
  refunds: { label: 'Remboursements', description: 'Gestion des remboursements.' },
  fec: { label: 'Export FEC', description: 'Exports comptables.' },
  documents: {
    label: 'Documents',
    description: 'Dépôt, téléchargement et génération des documents PDF.',
  },
  email: {
    label: 'Emails métier',
    description:
      'Envoi de factures et avoirs par email. La récupération de compte reste disponible.',
  },
} as const;

export type FeatureKey = keyof typeof FEATURES;
export type FeatureState = Record<FeatureKey, boolean>;
export const defaultFeatures = Object.fromEntries(
  Object.keys(FEATURES).map((key) => [key, true]),
) as FeatureState;

export function featuresForPage(path: string): FeatureKey[] {
  if (path.startsWith('/dashboard/super-admin') || path === '/dashboard/account') return [];
  const parts = path.split('/');
  const aliases: Record<string, FeatureKey> = {
    'credit-notes': 'creditNotes',
    staff: 'staff',
    parents: 'parents',
    'payment-methods': 'payments',
    'camp-types': 'camps',
  };
  const segments = parts
    .slice(3)
    .filter(
      (part, index, all) => !(part === 'users' && ['parents', 'staff'].includes(all[index + 1])),
    );
  const modules = segments.flatMap((part) => {
    const key = aliases[part] ?? part;
    return key in FEATURES ? [key as FeatureKey] : [];
  });
  return ['application', ...modules];
}
