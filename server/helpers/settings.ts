/**
 * Minimal interface for Prisma clients that can query appSetting.
 * Compatible with both PrismaClient and extended clients (soft-delete, $transaction).
 */
interface HasAppSetting {
  appSetting: {
    findUnique: (args: {
      where: { category_key: { category: string; key: string } };
      select: { value: true };
    }) => Promise<{ value: string | null } | null>;
  };
}

const DEFAULTS = {
  pricing: {
    // ALVM est exonérée de TGC (article LP 492 — Loi du pays N°2016-14 du
    // 30/09/2016). Le fallback DOIT être 0 : un défaut à 11 a facturé de la
    // TGC illégale quand app_settings.pricing n'était pas seedé (P0 2026-07-06).
    tax_rate: 0,
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

  if (!Number.isFinite(parsed)) {
    // Defensive fallback: stored value is malformed (e.g. unquoted string, null,
    // or non-numeric JSON). Log so it can be fixed in BDD, but do not crash.
    console.warn(
      `[settings] pricing.${key} value is not a finite number (got ${JSON.stringify(row.value)}). ` +
      `Falling back to default ${DEFAULTS.pricing[key]}.`,
    );
    return DEFAULTS.pricing[key];
  }

  return parsed;
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

  // Extra guard: getPricingSetting already returns the default if the stored
  // value isn't a finite number, but we double-check here in case future code
  // paths bypass it. The output is never new Date(NaN) silently.
  const safeDays = Number.isFinite(days) && days > 0
    ? days
    : DEFAULTS.pricing.payment_terms_days;

  if (safeDays !== days) {
    console.warn(
      `[settings] getDefaultDueDate received invalid days=${days}, falling back to ${safeDays}`,
    );
  }

  return new Date(Date.now() + safeDays * 24 * 60 * 60 * 1000);
}

export async function getCreditExpiryDate(
  prisma: HasAppSetting,
): Promise<Date> {
  const days = await getPricingSetting(prisma, 'credit_expiry_days');
  const safeDays = Number.isFinite(days) && days > 0
    ? days
    : DEFAULTS.pricing.credit_expiry_days;
  const date = new Date();
  date.setDate(date.getDate() + safeDays);
  return date;
}

/**
 * Parses a setting value into a number. Tolerates:
 *  - JSON-encoded numbers (e.g. "30", "0.11")
 *  - Plain numeric strings ("30")
 *  - JSON-encoded strings of numbers (e.g. "\"30\"")
 * Returns NaN if the value cannot be coerced — callers MUST guard with
 * Number.isFinite() before using the result.
 */
function parseJsonNumber(value: string): number {
  // 1. Try JSON.parse first — handles numeric literals and quoted numbers
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === 'number') return parsed;
    if (typeof parsed === 'string') {
      const n = Number(parsed);
      return Number.isFinite(n) ? n : NaN;
    }
    // boolean/null/object → not usable
    return NaN;
  } catch {
    // 2. Fallback: Number() on the raw string
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
  }
}
