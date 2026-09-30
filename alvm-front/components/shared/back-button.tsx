import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function BackButton({ href, label = 'Retour' }: { href: string; label?: string }) {
  return (
    <Button asChild variant="outline" size="sm">
      <Link href={href}>
        <ArrowLeft aria-hidden className="h-4 w-4" />
        {label}
      </Link>
    </Button>
  );
}
