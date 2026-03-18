/**
 * Minimal interface for Prisma clients that can query appSetting.
 * Compatible with both PrismaClient and extended clients (soft-delete, $transaction).
 */
interface HasAppSetting {
  appSetting: {
    findUnique: (args: any) => Promise<{ value: string | null } | null>;
  };
}

const DEFAULTS = {
  pricing: {
    tax_rate: 11,
    payment_terms_days: 30,
    credit_expiry_days: 365,
    payment_method_inactive_days: 30,
  },
} as const;

type PricingKey = keyof typeof DEFAULTS.pricing;

export async function getPricingSetting(
  prisma: HasAppSetting,
  key: PricingKey,
): Promise<number> {
  const row = await prisma.appSetting.findUnique({
    where: { category_key: { category: 'pricing', key } },
    select: { value: true },
  });

  if (!row?.value) return DEFAULTS.pricing[key];

  const parsed = typeof row.value === 'string' ? parseJsonNumber(row.value) : Number(row.value);
  return Number.isFinite(parsed) ? parsed : DEFAULTS.pricing[key];
}

export async function getTaxRateDecimal(
  prisma: HasAppSetting,
): Promise<number> {
  const pct = await getPricingSetting(prisma, 'tax_rate');
  return pct / 100;
}

export async function getDefaultDueDate(
  prisma: HasAppSetting,
): Promise<Date> {
  const days = await getPricingSetting(prisma, 'payment_terms_days');
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export async function getCreditExpiryDate(
  prisma: HasAppSetting,
): Promise<Date> {
  const days = await getPricingSetting(prisma, 'credit_expiry_days');
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function parseJsonNumber(value: string): number {
  try {
    return Number(JSON.parse(value));
  } catch {
    return Number(value);
  }
}
