import { createServerTRPC } from '@/lib/trpc';
import { PaymentMethodsTable } from './payment-methods-table';

export default async function PaymentMethodsPage() {
  const trpc = await createServerTRPC();
  const paymentMethods = await trpc.paymentMethods.listAll();

  return <PaymentMethodsTable initialMethods={paymentMethods} />;
}
