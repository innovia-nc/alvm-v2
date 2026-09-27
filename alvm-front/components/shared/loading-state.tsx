import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function LoadingState({
  label = 'Chargement…',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        'flex min-h-32 items-center justify-center gap-3 rounded-xl bg-card p-6 text-sm text-muted-foreground',
        className,
      )}
    >
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      {label}
    </div>
  );
}
