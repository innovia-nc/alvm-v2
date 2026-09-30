'use client';

import { FormActions } from '@/components/shared/form-actions';
import { usePagedOptions } from '@/hooks/use-paged-options';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RequiredMark } from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { trpc } from '@/lib/trpc/client';
import { formatDate } from '@/lib/utils';
import { AlertCircle, Calendar, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

// ============================================================================
// TYPES
// ============================================================================

// Pas de bornes d'age : un camp n'en porte aucune. Ni `Camp` ni `CampDay`
// n'ont de colonne d'age dans `prisma/schema.prisma`, aucune procedure n'en
// expose, et la page appelante n'en passait pas. Les props `minAge` / `maxAge`
// et le controle de compatibilite qu'elles alimentaient sont retires
// (sixieme passe de code mort) : la garde `minAge === undefined` sortait a
// chaque appel, le message d'erreur n'a jamais pu s'afficher. Le besoin, lui,
// reste ouvert — voir TD-024 dans docs/dette-technique.md.
interface RegistrationFormProps {
  campId: string;
  campName: string;
  pricePerDay: number;
  totalPrice?: number;
  availableSpots: number;
  startDate: string;
  endDate: string;
  daysCount: number;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function RegistrationForm({
  campId,
  campName,
  pricePerDay,
  totalPrice: acceptedTotal,
  availableSpots,
  startDate,
  endDate,
  daysCount,
}: RegistrationFormProps) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [selectedChildId, setSelectedChildId] = useState<string>('');
  const [specialRequirements, setSpecialRequirements] = useState('');

  // Fetch children
  const optionsPage0 = usePagedOptions('un participant');
  const {
    data: childrenData,
    isLoading: loadingChildren,
    error: optionsError0,
    refetch: optionsRetry0,
  } = trpc.children.list.useQuery({
    ...optionsPage0.params,
  });

  // Create registration mutation
  const createRegistration = trpc.registrations.create.useMutation({
    onSuccess: async () => {
      await utils.dashboard.summary.invalidate(undefined, { refetchType: 'all' });
      toast.success('Inscription réussie', {
        description: `${selectedChild?.firstName} a été inscrit(e) au camp ${campName}`,
      });
      router.push('/dashboard/parent/registrations');
      router.refresh();
    },
    onError: (error) => {
      toast.error("Erreur lors de l'inscription", {
        description: error.message,
      });
    },
  });

  const children = childrenData?.children || [];
  const selectedChild = children.find((child) => child.id === selectedChildId);

  // Calculate child's age
  const calculateAge = (birthDate: Date): number => {
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  // Calculate total price for the entire camp
  const totalPrice = acceptedTotal ?? daysCount * pricePerDay;

  // Validate form
  const canSubmit = selectedChildId && !createRegistration.isPending && availableSpots > 0;

  // Handle submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canSubmit) return;

    createRegistration.mutate({
      campId,
      childId: selectedChildId,
      specialRequirements: specialRequirements.trim() || undefined,
    });
  };

  // Camp full alert
  if (availableSpots <= 0) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Ce camp est complet. Il n'y a plus de places disponibles.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Inscription au camp</CardTitle>
        <CardDescription>Remplissez le formulaire pour inscrire votre enfant</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-3 empty:hidden">
            {(Boolean(optionsPage0.params.search) ||
              optionsPage0.params.offset > 0 ||
              (childrenData?.total ?? 0) > 20 ||
              !!optionsError0) &&
              optionsPage0.controls(
                childrenData?.total ?? 0,
                loadingChildren,
                optionsError0,
                optionsRetry0,
              )}
          </div>

          {/* Child selection */}
          <div className="space-y-2">
            <Label htmlFor="child-select">
              Sélectionner un enfant
              <RequiredMark />
            </Label>
            {loadingChildren ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Chargement des enfants...
              </div>
            ) : children.length === 0 ? (
              <Alert>
                <AlertDescription>
                  {optionsPage0.params.search
                    ? 'Aucun enfant ne correspond à cette recherche.'
                    : 'Ajoutez la fiche de votre enfant pour poursuivre cette inscription.'}
                  <Button
                    type="button"
                    variant="link"
                    className="p-0 h-auto ml-1"
                    onClick={() => router.push(`/dashboard/parent/children/new?campId=${campId}`)}
                  >
                    Ajouter un enfant
                  </Button>
                </AlertDescription>
              </Alert>
            ) : (
              <Select value={selectedChildId} onValueChange={setSelectedChildId}>
                <SelectTrigger id="child-select">
                  <SelectValue placeholder="Choisissez un enfant" />
                </SelectTrigger>
                <SelectContent>
                  {children.map((child) => {
                    const age = calculateAge(child.birthDate);
                    return (
                      <SelectItem key={child.id} value={child.id}>
                        {child.firstName} {child.lastName} ({age} ans)
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Camp period and price */}
          <div className="space-y-3">
            <Label>Période du camp</Label>
            <Alert>
              <Calendar className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm">
                      Du {formatDate(new Date(startDate))} au {formatDate(new Date(endDate))}
                    </span>
                    <span className="font-semibold">
                      {daysCount} jour{daysCount > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
                    <span className="text-sm">
                      {daysCount} jour{daysCount > 1 ? 's' : ''} ×{' '}
                      {pricePerDay.toLocaleString('fr-FR')} XPF
                    </span>
                    <span className="font-bold text-lg">
                      {totalPrice.toLocaleString('fr-FR')} XPF
                    </span>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
            <p className="text-xs text-muted-foreground">
              L'inscription se fait pour toute la durée du camp
            </p>
          </div>

          {/* Special requirements */}
          <div className="space-y-2">
            <Label htmlFor="special-requirements">Besoins spécifiques (optionnel)</Label>
            <Textarea
              id="special-requirements"
              placeholder="Allergies, régime alimentaire, besoins médicaux, etc."
              value={specialRequirements}
              onChange={(e) => setSpecialRequirements(e.target.value)}
              rows={4}
            />
          </div>

          {/* Submit button */}
          <FormActions>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/dashboard/parent/camps')}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {createRegistration.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Inscription en cours...
                </>
              ) : (
                "Confirmer l'inscription"
              )}
            </Button>
          </FormActions>

          {/* Capacity warning */}
          {availableSpots > 0 && availableSpots <= 5 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Attention : Il ne reste que {availableSpots} place{availableSpots > 1 ? 's' : ''}{' '}
                disponible{availableSpots > 1 ? 's' : ''} !
              </AlertDescription>
            </Alert>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
