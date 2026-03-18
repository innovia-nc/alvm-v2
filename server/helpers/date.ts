/**
 * Calculates the number of days between two dates (inclusive).
 */
export function computeDaysCount(startDate: Date | null, endDate: Date | null): number {
  if (!startDate || !endDate) return 0;
  return Math.floor(
    (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
  ) + 1;
}
