export const DEFAULT_BRANDING = {
  name: 'ALVM',
  description: 'Camps, activités et inscriptions',
  supportEmail: '',
};
export type Branding = typeof DEFAULT_BRANDING;
export const INTEGRATIONS = {
  resend: {
    label: 'Emails — Resend',
    description: 'Clé utilisée pour les emails métier et la récupération de mot de passe.',
    environment: 'RESEND_API_KEY',
  },
  blobPublic: {
    label: 'Stockage public — Vercel Blob',
    description: 'Jeton utilisé pour le logo de l’entreprise.',
    environment: 'BLOB_READ_WRITE_TOKEN',
  },
  blobPrivate: {
    label: 'Stockage privé — Vercel Blob',
    description: 'Jeton utilisé pour les documents privés et les PDF.',
    environment: 'BLOB_PRIVATE_READ_WRITE_TOKEN',
  },
} as const;
export type IntegrationId = keyof typeof INTEGRATIONS;
