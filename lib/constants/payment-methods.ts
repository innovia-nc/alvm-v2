export const PAYMENT_METHOD_CODES = {
  CASH: 'CASH',
  CHECK: 'CHECK',
  BANK_TRANSFER: 'BANK_TRANSFER',
  CREDIT_CARD: 'CREDIT_CARD',
  OTHER: 'OTHER',
  CREDIT_NOTE: 'CREDIT_NOTE',
} as const;

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Especes',
  CHECK: 'Cheque',
  BANK_TRANSFER: 'Virement bancaire',
  CREDIT_CARD: 'Carte bancaire',
  OTHER: 'Autre',
  CREDIT_NOTE: 'Avoir',
};

export function getPaymentMethodLabel(code: string): string {
  return PAYMENT_METHOD_LABELS[code] || code;
}
