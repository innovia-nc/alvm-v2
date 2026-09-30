import { TRPCError } from '@trpc/server';
import { defaultFeatures, type FeatureKey, type FeatureState } from '@alvm/shared/features';

type SettingsReader = {
  appSetting: {
    findFirst: (args: {
      where: { category: string; key: string };
      select: { value: true };
    }) => Promise<{ value: string | null } | null>;
  };
};

/** Modules du tenant de la transaction courante (réglés par la super administration). */
export async function getFeatures(db: SettingsReader): Promise<FeatureState> {
  const row = await db.appSetting.findFirst({
    where: { category: 'features', key: 'modules' },
    select: { value: true },
  });
  if (!row) return { ...defaultFeatures };
  try {
    const saved = JSON.parse(row.value ?? '{}');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved))
      throw new Error('Invalid features');
    return Object.fromEntries(
      Object.entries(defaultFeatures).map(([key]) => [
        key,
        typeof saved[key] === 'boolean' ? saved[key] : true,
      ]),
    ) as FeatureState;
  } catch {
    // A malformed persisted switch must never silently reopen the application.
    return { ...defaultFeatures, application: false };
  }
}

export async function assertFeaturesEnabled(
  db: SettingsReader,
  role: string | undefined,
  keys: FeatureKey[],
) {
  if (role === 'SUPER_ADMIN') {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'La super administration ne donne pas accès aux données métier.',
    });
  }
  const state = await getFeatures(db);
  if (['application', ...keys].some((key) => !state[key as FeatureKey])) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Cette fonctionnalité est désactivée par le super administrateur.',
    });
  }
}

export async function assertProcedureEnabled(
  db: SettingsReader,
  role: string | undefined,
  path: string,
) {
  if (
    path === 'health' ||
    path.startsWith('account.') ||
    path.startsWith('features.') ||
    path.startsWith('platform.')
  )
    return;
  const [module, action] = path.split('.');
  const aliases: Record<string, FeatureKey> = {
    campTypes: 'camps',
    paymentMethods: 'payments',
    childDocuments: 'documents',
    staffDocuments: 'documents',
  };
  const key = aliases[module] ?? module;
  const keys: FeatureKey[] = key in defaultFeatures ? [key as FeatureKey] : [];
  if (module === 'childDocuments') keys.push('children');
  if (module === 'staffDocuments') keys.push('staff');
  if (/pdf/i.test(action)) keys.push('documents');
  if (/email/i.test(action) && module !== 'settings') keys.push('email');
  await assertFeaturesEnabled(db, role, keys);
}
