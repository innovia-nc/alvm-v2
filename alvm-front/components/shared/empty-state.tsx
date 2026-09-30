import * as React from 'react';
import type { ComponentType, ReactNode } from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
}: {
  title: string;
  description?: ReactNode;
  icon?: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-h-52 flex-col items-center justify-center rounded-xl border border-dashed bg-card px-4 py-8 text-center sm:px-6',
        className,
      )}
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
        <Icon className="h-6 w-6 text-muted-foreground" aria-hidden />
      </div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
