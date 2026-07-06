'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { trpc } from '@/lib/trpc/client';
import { CalendarDays, MapPin, Users, Pencil, MoreHorizontal, Send, XCircle, Copy, Loader2 } from 'lucide-react';
import Link from 'next/link';

// ============================================================================
// TYPES
// ============================================================================

type Camp = {
  id: string;
  name: string;
  description: string;
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'CANCELLED';
  location: string;
  pricePerDay: number;
  maxCapacity: number;
  daysCount: number;
  registrationDeadline: Date;
  registrationsCount: number;
  availableSpots: number;
};

type ActionType = 'publish' | 'close';

const duplicateSchema = z.object({
  name: z.string().min(3, 'Nom requis (min 3 caractères)').max(200),
});

type DuplicateFormData = z.infer<typeof duplicateSchema>;

// ============================================================================
// COMPOSANT
// ============================================================================

interface CampsCardsProps {
  initialCamps: Camp[];
}

export function CampsCards({ initialCamps }: CampsCardsProps) {
  const router = useRouter();
  const [actioningCamp, setActioningCamp] = useState<{ camp: Camp; action: ActionType } | null>(null);
  const [duplicatingCamp, setDuplicatingCamp] = useState<Camp | null>(null);
  const [error, setError] = useState<string | null>(null);

  const updateMutation = trpc.camps.update.useMutation();
  const duplicateMutation = trpc.camps.duplicate.useMutation();

  const duplicateForm = useForm<DuplicateFormData>({
    resolver: zodResolver(duplicateSchema),
    defaultValues: {
      name: '',
    },
  });

  async function handleAction() {
    if (!actioningCamp) return;

    try {
      setError(null);

      if (actioningCamp.action === 'publish') {
        await updateMutation.mutateAsync({
          id: actioningCamp.camp.id,
          status: 'PUBLISHED',
        });
      } else if (actioningCamp.action === 'close') {
        await updateMutation.mutateAsync({
          id: actioningCamp.camp.id,
          status: 'CLOSED',
        });
      }

      setActioningCamp(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Impossible d'effectuer cette action");
      setActioningCamp(null);
    }
  }

  async function handleDuplicate(values: DuplicateFormData) {
    if (!duplicatingCamp) return;

    try {
      setError(null);
      await duplicateMutation.mutateAsync({
        id: duplicatingCamp.id,
        name: values.name,
      });
      setDuplicatingCamp(null);
      duplicateForm.reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Impossible de dupliquer ce camp");
    }
  }

  function openDuplicateDialog(camp: Camp) {
    setDuplicatingCamp(camp);
    duplicateForm.reset({
      name: `${camp.name} (copie)`,
    });
  }

  const getActionTitle = () => {
    if (!actioningCamp) return '';
    switch (actioningCamp.action) {
      case 'publish':
        return 'Publier le camp';
      case 'close':
        return 'Fermer le camp';
      default:
        return '';
    }
  };

  const getActionDescription = () => {
    if (!actioningCamp) return '';
    switch (actioningCamp.action) {
      case 'publish':
        return `Êtes-vous sûr de vouloir publier le camp "${actioningCamp.camp.name}" ? Il sera visible par tous les parents.`;
      case 'close':
        return `Êtes-vous sûr de vouloir fermer le camp "${actioningCamp.camp.name}" ? Aucune nouvelle inscription ne sera acceptée.`;
      default:
        return '';
    }
  };

  const isLoading = updateMutation.isPending || duplicateMutation.isPending;

  return (
    <>
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {initialCamps.map((camp) => {
          const now = new Date();
          const deadline = new Date(camp.registrationDeadline);
          const isPastDeadline = deadline < now;
          const isDraft = camp.status === 'DRAFT';
          const isClosed = camp.status === 'CLOSED';
          const isCancelled = camp.status === 'CANCELLED';
          const isPublished = camp.status === 'PUBLISHED';

          return (
            <Card key={camp.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">{camp.name}</CardTitle>
                    <CardDescription className="line-clamp-2">
                      {camp.description}
                    </CardDescription>
                  </div>
                  <Badge
                    variant={
                      isCancelled ? 'destructive' :
                      isClosed ? 'outline' :
                      isDraft ? 'secondary' :
                      'default'
                    }
                  >
                    {isCancelled ? 'Annulé' :
                     isClosed ? 'Fermé' :
                     isDraft ? 'Brouillon' :
                     'Publié'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center text-sm text-muted-foreground">
                  <CalendarDays className="mr-2 h-4 w-4" />
                  <span>
                    {camp.daysCount} jour{camp.daysCount > 1 ? 's' : ''}
                  </span>
                </div>

                <div className="flex items-center text-sm text-muted-foreground">
                  <CalendarDays className="mr-2 h-4 w-4" />
                  <span className={isPastDeadline ? 'text-red-600' : ''}>
                    Date limite: {deadline.toLocaleDateString('fr-FR')}
                    {isPastDeadline && ' (expiré)'}
                  </span>
                </div>

                <div className="flex items-center text-sm text-muted-foreground">
                  <MapPin className="mr-2 h-4 w-4" />
                  <span>{camp.location}</span>
                </div>

                <div className="flex items-center text-sm text-muted-foreground">
                  <Users className="mr-2 h-4 w-4" />
                  <span>
                    {camp.registrationsCount} / {camp.maxCapacity} inscrits ({camp.availableSpots} places disponibles)
                  </span>
                </div>

                <div className="pt-2 border-t">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Prix par jour:</span>
                    <span className="font-semibold">
                      {camp.pricePerDay.toLocaleString('fr-FR')} XPF
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-2 border-t flex gap-2">
                  <Link href={`/dashboard/staff/camps/${camp.id}/edit`} className="flex-1">
                    <Button variant="outline" className="w-full" size="sm">
                      <Pencil className="mr-2 h-3 w-3" />
                      Modifier
                    </Button>
                  </Link>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" disabled={isLoading}>
                        <span className="sr-only">Menu d&apos;actions</span>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {isDraft && (
                        <DropdownMenuItem
                          onClick={() => setActioningCamp({ camp, action: 'publish' })}
                        >
                          <Send className="mr-2 h-4 w-4" />
                          Publier
                        </DropdownMenuItem>
                      )}
                      {(isPublished || isDraft) && (
                        <DropdownMenuItem
                          onClick={() => setActioningCamp({ camp, action: 'close' })}
                        >
                          <XCircle className="mr-2 h-4 w-4" />
                          Fermer
                        </DropdownMenuItem>
                      )}
                      {!isCancelled && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => openDuplicateDialog(camp)}
                          >
                            <Copy className="mr-2 h-4 w-4" />
                            Dupliquer
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Dialog de confirmation */}
      <AlertDialog
        open={!!actioningCamp}
        onOpenChange={(open) => !open && setActioningCamp(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{getActionTitle()}</AlertDialogTitle>
            <AlertDialogDescription>
              {getActionDescription()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleAction}
              disabled={isLoading}
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de duplication */}
      <Dialog open={!!duplicatingCamp} onOpenChange={(open) => !open && setDuplicatingCamp(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dupliquer le camp</DialogTitle>
            <DialogDescription>
              Créez une copie de "{duplicatingCamp?.name}" avec les mêmes dates. Le nouveau camp sera créé en mode brouillon.
            </DialogDescription>
          </DialogHeader>

          <Form {...duplicateForm}>
            <form onSubmit={duplicateForm.handleSubmit(handleDuplicate)} className="space-y-4">
              <FormField
                control={duplicateForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nom du nouveau camp *</FormLabel>
                    <FormControl>
                      <Input placeholder="Nom du camp dupliqué" {...field} />
                    </FormControl>
                    <FormDescription>
                      Toutes les autres informations seront copiées à l'identique
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDuplicatingCamp(null)}
                  disabled={duplicateMutation.isPending}
                >
                  Annuler
                </Button>
                <Button type="submit" disabled={duplicateMutation.isPending}>
                  {duplicateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Dupliquer
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
