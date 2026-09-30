import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { prisma } from '@back/db';
import { DEFAULT_BRANDING, INTEGRATIONS, type Branding, type IntegrationId } from '@alvm/shared/platform';

type IntegrationReader = Pick<typeof prisma, 'platformIntegration'>;
type SettingsReader = Pick<typeof prisma, 'platformSetting'>;

function encryptionKey() {
  const key = Buffer.from(process.env.PLATFORM_ENCRYPTION_KEY ?? '', 'base64');
  if (key.length !== 32)
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message:
        'Le chiffrement des clés API doit être configuré sur le serveur (PLATFORM_ENCRYPTION_KEY).',
    });
  return key;
}
export function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    data.toString('base64'),
  ].join('.');
}
export function decryptSecret(value: string): string {
  try {
    const [version, iv, tag, data] = value.split('.');
    if (version !== 'v1' || !iv || !tag || !data) throw new Error('Invalid encrypted secret');
    const cipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64'));
    cipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([cipher.update(Buffer.from(data, 'base64')), cipher.final()]).toString(
      'utf8',
    );
  } catch {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message:
        'Clé API illisible. Vérifiez la clé de chiffrement du serveur ou remplacez la clé API.',
    });
  }
}
export async function getIntegrationSecret(
  id: IntegrationId,
  db: IntegrationReader = prisma,
): Promise<string | null> {
  const row = await db.platformIntegration.findUnique({ where: { id } });
  if (row && !row.enabled) return null;
  if (row?.encryptedSecret) return decryptSecret(row.encryptedSecret);
  return process.env[INTEGRATIONS[id].environment]?.trim() || null;
}
/**
 * Identité de la plateforme (nom, description, support). Globale : lisible
 * sans contexte de tenant (`platform_settings`, policy de lecture ouverte).
 */
export async function getBranding(db: SettingsReader = prisma): Promise<Branding> {
  const row = await db.platformSetting.findUnique({ where: { key: 'branding' } });
  if (!row?.value) return { ...DEFAULT_BRANDING };
  try {
    const parsed = JSON.parse(row.value);
    return {
      name:
        typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name : DEFAULT_BRANDING.name,
      description:
        typeof parsed.description === 'string' ? parsed.description : DEFAULT_BRANDING.description,
      supportEmail: typeof parsed.supportEmail === 'string' ? parsed.supportEmail : '',
    };
  } catch {
    return { ...DEFAULT_BRANDING };
  }
}
