import * as React from 'react';
import type { ReactNode } from 'react';

export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div
      role="group"
      aria-label="Filtres"
      className="flex w-full flex-wrap items-end gap-4 rounded-xl border bg-card p-4 [&>div]:min-w-0 [&>div]:max-w-full"
    >
      {children}
    </div>
  );
}
