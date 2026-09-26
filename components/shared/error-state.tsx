import * as React from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ErrorState({
  message = 'Impossible de charger les données.',
  onRetry,
}: {
  message?: string;
  onRetry?: () => unknown;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-4 rounded-xl border border-destructive/30 bg-card p-5 sm:flex-row sm:items-center"
    >
      <AlertCircle className="h-5 w-5 shrink-0 text-destructive" aria-hidden />
      <p className="flex-1 text-sm">{message}</p>
      {onRetry && (
        <Button type="button" variant="outline" onClick={() => onRetry()}>
          Réessayer
        </Button>
      )}
    </div>
  );
}
