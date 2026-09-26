/** Identical numeric and date conventions during SSR and hydration. */
export const BUSINESS_LOCALE = 'fr-FR';
export const BUSINESS_TIME_ZONE = 'Pacific/Noumea';
export const formatNumber = (amount: number) =>
  new Intl.NumberFormat(BUSINESS_LOCALE).format(amount);
export const formatXpf = (amount: number) => `${formatNumber(amount)} XPF`;
