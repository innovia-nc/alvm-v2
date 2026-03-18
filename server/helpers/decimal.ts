import type { Decimal } from '@prisma/client/runtime/library';

/**
 * Converts a Prisma Decimal, number, null, or undefined value to a plain JS number.
 * Returns 0 for null/undefined values.
 */
export function toNum(v: Decimal | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === 'number' ? v : Number(v);
}
