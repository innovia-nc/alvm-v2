import * as React from 'react';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

/** The same reading order and action area across the family's lists. */
export function ParentRecordCard({
  title,
  href,
  description,
  status,
  summary,
  children,
  actions,
}: {
  title: string;
  href: string;
  description?: React.ReactNode;
  status?: React.ReactNode;
  summary?: React.ReactNode;
  children?: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardTitle className="min-w-0 flex-1">
            <Link href={href} className="hover:text-primary hover:underline">
              {title}
            </Link>
          </CardTitle>
          {status && <div className="shrink-0">{status}</div>}
        </div>
        {description && <CardDescription>{description}</CardDescription>}
        {summary && <div className="text-lg font-semibold tabular-nums">{summary}</div>}
      </CardHeader>
      {children && (
        <CardContent className="flex-1 space-y-3 text-sm text-muted-foreground">
          {children}
        </CardContent>
      )}
      <CardFooter className="mt-auto border-t p-4 sm:p-6 [&>a]:flex-1 [&>button]:flex-1">
        {actions}
      </CardFooter>
    </Card>
  );
}
