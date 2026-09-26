import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function ParentStatusFilters({
  basePath,
  value,
  options,
}: {
  basePath: string;
  value?: string;
  options: { value?: string; label: string }[];
}) {
  return (
    <nav aria-label="Filtrer par statut" className="flex flex-wrap gap-2">
      {options.map((option) => (
        <Button
          key={option.value ?? 'all'}
          asChild
          size="sm"
          variant="outline"
          className={
            value === option.value
              ? 'border-primary bg-primary/10 text-primary hover:bg-primary/20'
              : 'text-muted-foreground'
          }
        >
          <Link
            href={basePath + (option.value ? `?status=${option.value}` : '')}
            aria-current={value === option.value ? 'page' : undefined}
          >
            {option.label}
          </Link>
        </Button>
      ))}
    </nav>
  );
}
