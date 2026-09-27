'use client';
import { Button } from '@/components/ui/button';
export default function DashboardError({ reset }: { reset: () => void }) {
  return (
    <div role="alert" className="space-y-4 p-6">
      <p>Impossible de charger cette page. Veuillez réessayer.</p>
      <Button onClick={reset}>Réessayer</Button>
    </div>
  );
}
