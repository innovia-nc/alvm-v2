import { createServerTRPC } from '@/lib/trpc';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { PaymentMethodsTable } from './payment-methods-table';

export default async function PaymentMethodsPage() {
  const trpc = await createServerTRPC();
  const paymentMethods = await trpc.paymentMethods.listAll();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Méthodes de Paiement"
        description="Configuration des méthodes de paiement acceptées"
      />

      <Card>
        <CardContent className="p-6">
          <PaymentMethodsTable initialMethods={paymentMethods} />
        </CardContent>
      </Card>
    </div>
  );
}
