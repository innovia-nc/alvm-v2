import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FileQuestion } from 'lucide-react';

/**
 * 404 applicatif — URL ne correspondant à aucune route.
 *
 * Next.js n'utilise QUE ce fichier racine pour les URL non appariées : un
 * `not-found.tsx` imbriqué ne sert que les appels explicites à `notFound()`
 * dans son sous-arbre. Sans ce fichier, l'utilisateur tombait sur la page
 * blanche par défaut de Next, hors de toute mise en page ALVM et sans aucun
 * chemin de retour.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <FileQuestion
            className="h-12 w-12 text-muted-foreground"
            aria-hidden="true"
          />

          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">Page introuvable</h1>
            <p className="text-sm text-muted-foreground">
              L&apos;adresse demandée n&apos;existe pas ou n&apos;est plus
              disponible.
            </p>
          </div>

          <Button asChild>
            <Link href="/dashboard">Retour au tableau de bord</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
