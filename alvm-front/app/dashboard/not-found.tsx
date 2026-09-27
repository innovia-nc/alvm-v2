import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SearchX } from 'lucide-react';

/**
 * 404 du tableau de bord — rendu DANS le shell (sidebar + header conservés).
 *
 * Sert les appels explicites à `notFound()` des pages de détail
 * (`invoices/[id]`, `children/[id]`, `registrations/[id]`, …) : une vingtaine de
 * pages les utilisaient alors qu'aucun `not-found.tsx` n'existait dans le dépôt,
 * si bien qu'un identifiant inconnu éjectait l'utilisateur hors de
 * l'application.
 *
 * Les URL n'appariant aucune route sont, elles, servies par `app/not-found.tsx`.
 */
export default function DashboardNotFound() {
  return (
    <Card className="mx-auto max-w-md">
      <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
        <SearchX
          className="h-12 w-12 text-muted-foreground"
          aria-hidden="true"
        />

        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Élément introuvable</h1>
          <p className="text-sm text-muted-foreground">
            Cet élément n&apos;existe pas, a été supprimé, ou n&apos;est pas
            accessible avec votre compte.
          </p>
        </div>

        <Button asChild variant="outline">
          <Link href="/dashboard">Retour au tableau de bord</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
