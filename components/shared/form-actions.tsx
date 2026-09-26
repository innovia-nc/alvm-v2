import * as React from 'react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Secondary action first, submit last: the same DOM and visual order on every screen. */
export function FormActions({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 border-t pt-6 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end [&>button]:w-full [&>a]:w-full sm:[&>button]:w-auto sm:[&>a]:w-auto',
        className,
      )}
    >
      {children}
    </div>
  );
}
