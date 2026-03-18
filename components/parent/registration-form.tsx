'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { AlertCircle, Calendar, Loader2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

interface RegistrationFormProps {
  campId: string;
  campName: string;
  pricePerDay: number;
  minAge?: number;
  maxAge?: number;
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
  minAge,
  maxAge,
  availableSpots,
  startDate,
  endDate,
  daysCount,
}: RegistrationFormProps) {
  const router = useRouter();
  const [selectedChildId, setSelectedChildId] = useState<string>('');
  const [specialRequirements, setSpecialRequirements] = useState('');
  const [ageError, setAgeError] = useState('');

  // Fetch children
  const { data: childrenData, isLoading: loadingChildren } = trpc.children.list.useQuery({
    limit: 100,
    offset: 0,
  });

  // Create registration mutation
  const createRegistration = trpc.registrations.create.useMutation({
    onSuccess: () => {
      toast.success('Inscription r\u00e9ussie', {
        description: `${selectedChild?.firstName} a \u00e9t\u00e9 inscrit(e) au camp ${campName}`,
      });
      router.push('/dashboard/parent/registrations');
      router.refresh();
    },
    onError: (error) => {
      toast.error('Erreur lors de l\'inscription', {
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

  // Check age compatibility
  const checkAgeCompatibility = (childId: string) => {
    const child = children.find((c) => c.id === childId);
    if (!child) return;

    // Skip age validation if age limits are not defined
    if (minAge === undefined || maxAge === undefined) {
      setAgeError('');
      return;
    }

    const age = calculateAge(child.birthDate);
    if (age < minAge || age > maxAge) {
      setAgeError(
        `Cet enfant a ${age} ans. Le camp accepte les enfants de ${minAge} \u00e0 ${maxAge} ans.`
      );
    } else {
      setAgeError('');
    }
  };

  // Handle child selection
  const handleChildSelect = (childId: string) => {
    setSelectedChildId(childId);
    checkAgeCompatibility(childId);
  };

  // Calculate total price for the entire camp
  const totalPrice = daysCount * pricePerDay;

  // Validate form
  const canSubmit =
    selectedChildId &&
    !ageError &&
    !createRegistration.isPending &&
    availableSpots > 0;

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
        <CardDescription>
          Remplissez le formulaire pour inscrire votre enfant
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Child selection */}
          <div className="space-y-2">
            <Label htmlFor="child-select">S\u00e9lectionner un enfant *</Label>
            {loadingChildren ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Chargement des enfants...
              </div>
            ) : children.length === 0 ? (
              <Alert>
                <AlertDescription>
                  Vous devez d'abord ajouter un enfant avant de pouvoir vous inscrire.
                  <Button
                    variant="link"
                    className="p-0 h-auto ml-1"
                    onClick={() => router.push('/dashboard/parent/children/new')}
                  >
                    Ajouter un enfant
                  </Button>
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <Select value={selectedChildId} onValueChange={handleChildSelect}>
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

                {ageError && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{ageError}</AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </div>

          {/* Camp period and price */}
          <div className="space-y-3">
            <Label>P\u00e9riode du camp</Label>
            <Alert>
              <Calendar className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">
                      Du {formatDate(new Date(startDate))} au {formatDate(new Date(endDate))}
                    </span>
                    <span className="font-semibold">
                      {daysCount} jour{daysCount > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t pt-2">
                    <span className="text-sm">
                      {daysCount} jour{daysCount > 1 ? 's' : ''} \u00d7 {pricePerDay.toLocaleString('fr-FR')} XPF
                    </span>
                    <span className="font-bold text-lg">
                      {totalPrice.toLocaleString('fr-FR')} XPF
                    </span>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
            <p className="text-xs text-muted-foreground">
              L'inscription se fait pour toute la dur\u00e9e du camp
            </p>
          </div>

          {/* Special requirements */}
          <div className="space-y-2">
            <Label htmlFor="special-requirements">
              Besoins sp\u00e9cifiques (optionnel)
            </Label>
            <Textarea
              id="special-requirements"
              placeholder="Allergies, r\u00e9gime alimentaire, besoins m\u00e9dicaux, etc."
              value={specialRequirements}
              onChange={(e) => setSpecialRequirements(e.target.value)}
              rows={4}
            />
          </div>

          {/* Submit button */}
          <div className="flex gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              className="flex-1"
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit}
              className="flex-1"
            >
              {createRegistration.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Inscription en cours...
                </>
              ) : (
                'Confirmer l\'inscription'
              )}
            </Button>
          </div>

          {/* Capacity warning */}
          {availableSpots > 0 && availableSpots <= 5 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Attention : Il ne reste que {availableSpots} place{availableSpots > 1 ? 's' : ''} disponible{availableSpots > 1 ? 's' : ''} !
              </AlertDescription>
            </Alert>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
