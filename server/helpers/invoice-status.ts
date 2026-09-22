import { toNum } from './decimal';
import type { InvoiceStatus } from '@prisma/client';
export function overdueWhere() {
  const today = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Noumea' }));
  return { status: { in: ['SENT', 'OVERDUE'] as InvoiceStatus[] }, dueDate: { lt: today } };
}
export function effectiveInvoiceStatus(invoice: {
  status: InvoiceStatus;
  dueDate: Date;
  totalAmount: Parameters<typeof toNum>[0];
  paidAmount: Parameters<typeof toNum>[0];
  creditedAmount?: Parameters<typeof toNum>[0];
}): InvoiceStatus {
  if (
    ['SENT', 'OVERDUE'].includes(invoice.status) &&
    invoice.dueDate < overdueWhere().dueDate.lt &&
    toNum(invoice.paidAmount) + toNum(invoice.creditedAmount) < toNum(invoice.totalAmount)
  )
    return 'OVERDUE';
  return invoice.status;
}
