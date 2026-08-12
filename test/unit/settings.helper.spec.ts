/**
 * Tests for server/helpers/settings.ts
 *
 * Covers the B2 fix: pricing settings must never return NaN silently,
 * and getDefaultDueDate must never return new Date(NaN).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getPricingSetting,
  getTaxRateDecimal,
  getDefaultDueDate,
  getCreditExpiryDate,
  getFecSiren,
  normalizeSiren,
} from '@/server/helpers/settings';

function makeFakePrisma(value: string | null | undefined) {
  return {
    appSetting: {
      findUnique: vi.fn().mockResolvedValue(value === undefined ? null : { value }),
    },
  };
}

describe('settings.helper — pricing values', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  describe('getPricingSetting', () => {
    it('returns default when row is missing', async () => {
      const prisma = makeFakePrisma(undefined);
      const result = await getPricingSetting(prisma as any, 'payment_terms_days');
      expect(result).toBe(30);
    });

    it('returns default when value is null', async () => {
      const prisma = makeFakePrisma(null);
      const result = await getPricingSetting(prisma as any, 'payment_terms_days');
      expect(result).toBe(30);
    });

    it('parses a JSON-encoded number ("30")', async () => {
      const prisma = makeFakePrisma('30');
      const result = await getPricingSetting(prisma as any, 'payment_terms_days');
      expect(result).toBe(30);
    });

    it('parses a JSON-encoded decimal ("0.11")', async () => {
      const prisma = makeFakePrisma('0.11');
      const result = await getPricingSetting(prisma as any, 'tax_rate');
      expect(result).toBe(0.11);
    });

    it('parses a JSON-encoded string of a number ("\\"30\\"")', async () => {
      const prisma = makeFakePrisma('"30"');
      const result = await getPricingSetting(prisma as any, 'payment_terms_days');
      expect(result).toBe(30);
    });

    it('falls back to default when value is non-numeric garbage', async () => {
      const prisma = makeFakePrisma('not-a-number');
      const result = await getPricingSetting(prisma as any, 'payment_terms_days');
      expect(result).toBe(30);
      expect(warnSpy).toHaveBeenCalled();
    });

    it('falls back to default when value is a JSON-encoded boolean', async () => {
      const prisma = makeFakePrisma('true');
      const result = await getPricingSetting(prisma as any, 'payment_terms_days');
      expect(result).toBe(30);
      expect(warnSpy).toHaveBeenCalled();
    });

    it('falls back to default when value is a JSON object', async () => {
      const prisma = makeFakePrisma('{"foo": "bar"}');
      const result = await getPricingSetting(prisma as any, 'payment_terms_days');
      expect(result).toBe(30);
      expect(warnSpy).toHaveBeenCalled();
    });

    it('never returns NaN', async () => {
      const prisma = makeFakePrisma('NaN');
      const result = await getPricingSetting(prisma as any, 'payment_terms_days');
      expect(Number.isFinite(result)).toBe(true);
    });
  });

  describe('getTaxRateDecimal', () => {
    it('converts percentage to decimal', async () => {
      const prisma = makeFakePrisma('11');
      const result = await getTaxRateDecimal(prisma as any);
      expect(result).toBeCloseTo(0.11);
    });

    it('falls back to default decimal when value is garbage', async () => {
      const prisma = makeFakePrisma('garbage');
      const result = await getTaxRateDecimal(prisma as any);
      // Défaut légal = 0 : ALVM est exonérée de TGC (LP 492) ; un fallback à
      // 11 % a facturé de la TGC à tort quand pricing n'était pas seedé.
      expect(result).toBe(0);
    });
  });

  describe('getDefaultDueDate', () => {
    it('returns a valid Date object', async () => {
      const prisma = makeFakePrisma('30');
      const result = await getDefaultDueDate(prisma as any);
      expect(result).toBeInstanceOf(Date);
      expect(Number.isNaN(result.getTime())).toBe(false);
    });

    it('returns a valid Date even when value is garbage (fallback to 30 days)', async () => {
      const prisma = makeFakePrisma('not-a-number');
      const result = await getDefaultDueDate(prisma as any);
      expect(result).toBeInstanceOf(Date);
      expect(Number.isNaN(result.getTime())).toBe(false);
      // Should be ~30 days in the future
      const diffMs = result.getTime() - Date.now();
      const diffDays = diffMs / (24 * 60 * 60 * 1000);
      expect(diffDays).toBeGreaterThan(29);
      expect(diffDays).toBeLessThan(31);
    });

    it('returns a valid Date when value is missing entirely', async () => {
      const prisma = makeFakePrisma(undefined);
      const result = await getDefaultDueDate(prisma as any);
      expect(result).toBeInstanceOf(Date);
      expect(Number.isNaN(result.getTime())).toBe(false);
    });

    it('never returns new Date(NaN)', async () => {
      const prisma = makeFakePrisma('{"corrupted":true}');
      const result = await getDefaultDueDate(prisma as any);
      expect(Number.isNaN(result.getTime())).toBe(false);
    });
  });

  describe('getCreditExpiryDate', () => {
    it('returns a valid Date with 365-day fallback when garbage', async () => {
      const prisma = makeFakePrisma('not-a-number');
      const result = await getCreditExpiryDate(prisma as any);
      expect(result).toBeInstanceOf(Date);
      expect(Number.isNaN(result.getTime())).toBe(false);
    });
  });
});

describe('settings.helper — SIREN du FEC (TD-012)', () => {
  describe('normalizeSiren', () => {
    it('accepts 9 raw digits', () => {
      expect(normalizeSiren('123456789')).toBe('123456789');
    });

    it('unwraps the JSON-stringified value written by settings.updateBulk', () => {
      expect(normalizeSiren('"123456789"')).toBe('123456789');
    });

    it('strips readability separators', () => {
      expect(normalizeSiren('123 456 789')).toBe('123456789');
      expect(normalizeSiren('"123.456.789"')).toBe('123456789');
    });

    it('preserves a leading zero (quoted value stays a string)', () => {
      expect(normalizeSiren('"012345678"')).toBe('012345678');
    });

    it('rejects anything that is not exactly 9 digits', () => {
      expect(normalizeSiren('12345678')).toBeNull();
      expect(normalizeSiren('1234567890')).toBeNull();
      expect(normalizeSiren('"ALVM"')).toBeNull();
      expect(normalizeSiren('""')).toBeNull();
      expect(normalizeSiren('')).toBeNull();
      expect(normalizeSiren(null)).toBeNull();
      expect(normalizeSiren(undefined)).toBeNull();
    });
  });

  describe('getFecSiren', () => {
    it('reads accounting.fec_siren', async () => {
      const prisma = makeFakePrisma('"123456789"');
      await expect(getFecSiren(prisma as any)).resolves.toBe('123456789');
      expect(prisma.appSetting.findUnique).toHaveBeenCalledWith({
        where: { category_key: { category: 'accounting', key: 'fec_siren' } },
        select: { value: true },
      });
    });

    it('returns null when the key was never filled in', async () => {
      await expect(getFecSiren(makeFakePrisma(undefined) as any)).resolves.toBeNull();
      await expect(getFecSiren(makeFakePrisma('""') as any)).resolves.toBeNull();
    });
  });
});
