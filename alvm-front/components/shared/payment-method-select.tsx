'use client';

import { LoadingState } from '@/components/shared/loading-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { trpc } from '@/lib/trpc/client';

interface PaymentMethodSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  excludeCreditNote?: boolean;
  placeholder?: string;
}

/**
 * Composant de sélection d'une méthode de paiement
 * Charge dynamiquement les méthodes actives depuis la base de données
 */
export function PaymentMethodSelect({
  value,
  onValueChange,
  disabled = false,
  excludeCreditNote = true,
  placeholder = 'Sélectionner une méthode',
}: PaymentMethodSelectProps) {
  const { data: paymentMethods, isLoading } = trpc.paymentMethods.list.useQuery();

  // Filtrer les méthodes si nécessaire
  const filteredMethods = paymentMethods?.filter((method) => {
    if (excludeCreditNote && method.code === 'CREDIT_NOTE') {
      return false;
    }
    return true;
  });

  if (isLoading) {
    return (
      <LoadingState
        label="Chargement des moyens de paiement…"
        className="min-h-10 justify-start p-2"
      />
    );
  }

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {filteredMethods && filteredMethods.length > 0 ? (
          filteredMethods.map((method) => (
            <SelectItem key={method.id} value={method.id}>
              <div className="flex flex-col">
                <span>{method.name}</span>
                {method.description && (
                  <span className="text-xs text-muted-foreground">{method.description}</span>
                )}
              </div>
            </SelectItem>
          ))
        ) : (
          <SelectItem value="_none" disabled>
            Aucune méthode disponible
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
