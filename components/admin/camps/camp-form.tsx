'use client';

/**
 * Camp Form Component (Simplifié)
 *
 * Formulaire pour la création et l'édition de camps.
 * Version simplifiée avec dates début/fin au lieu de journées individuelles.
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LoadingButton } from '@/components/ui/loading-button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Calendar } from 'lucide-react';
import { useMemo } from 'react';

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Schema du formulaire de camp (simplifié avec dates début/fin)
 */
const campFormSchema = z.object({
  name: z.string().min(3, 'Nom requis (min 3 caractères)').max(200),
  description: z.string().min(10, 'Description requise (min 10 caractères)'),
  campTypeId: z.string().uuid('Type de camp requis'),
  location: z.string().min(3, 'Lieu requis'),
  maxCapacity: z.number().min(1, 'Capacité minimale: 1').max(200, 'Capacité maximale: 200'),
  startDate: z.string().min(1, 'Date de début requise'),
  endDate: z.string().min(1, 'Date de fin requise'),
  registrationDeadline: z.string().min(1, 'Date limite requise'),
  totalPrice: z.number().min(0, 'Le prix doit être positif'),
  status: z.enum(['DRAFT', 'PUBLISHED']),
}).refine(
  (data) => {
    if (data.startDate && data.endDate) {
      return new Date(data.endDate) >= new Date(data.startDate);
    }
    return true;
  },
  {
    message: 'La date de fin doit être après ou égale à la date de début',
    path: ['endDate'],
  }
);

export type CampFormValues = z.infer<typeof campFormSchema>;

// ============================================================================
// TYPES
// ============================================================================

// Type interne au formulaire : aucun appelant ne l'importe, les pages passent
// directement le résultat de `campTypes.list`. Ne pas rouvrir l'export sans
// appelant — le nom entre en collision avec le modèle Prisma `CampType`.
type CampType = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
};

type CampFormProps = {
  defaultValues?: Partial<CampFormValues>;
  onSubmit: (data: CampFormValues) => void;
  isSubmitting?: boolean;
  mode: 'create' | 'edit';
  campTypes: CampType[];
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calcule le nombre de jours entre deux dates
 */
function calculateDaysBetween(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 0;

  const start = new Date(startDate);
  const end = new Date(endDate);

  const diffTime = end.getTime() - start.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

  return diffDays > 0 ? diffDays : 0;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function CampForm({
  defaultValues,
  onSubmit,
  isSubmitting = false,
  mode,
  campTypes,
}: CampFormProps) {
  const form = useForm<CampFormValues>({
    resolver: zodResolver(campFormSchema),
    defaultValues: {
      status: 'DRAFT',
      ...defaultValues,
    },
    mode: 'onBlur',
  });

  // Watch des dates pour calcul du nombre de jours
  const startDate = form.watch('startDate');
  const endDate = form.watch('endDate');

  // Calcul du nombre de jours
  const daysCount = useMemo(() => {
    return calculateDaysBetween(startDate, endDate);
  }, [startDate, endDate]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Section: Informations générales */}
        <Card>
          <CardHeader>
            <CardTitle>Informations générales</CardTitle>
            <CardDescription>
              Informations de base sur le camp de vacances
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Nom */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nom du camp *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ex: Camp d'été Pirates 2025"
                      {...field}
                      autoFocus={mode === 'create'}
                    />
                  </FormControl>
                  <FormDescription>
                    Nom affiché publiquement pour les parents
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description *</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Décrivez les activités, objectifs et particularités du camp..."
                      className="min-h-[120px]"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Description complète visible par les parents (min 10 caractères)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Type de camp */}
            <FormField
              control={form.control}
              name="campTypeId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type de camp *</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                    disabled={mode === 'edit'}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionnez un type de camp" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {campTypes.map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {mode === 'create'
                      ? 'Catégorie du camp selon la tranche d\'âge'
                      : 'Type de camp (non modifiable après création)'}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Statut */}
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Statut de publication *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionnez un statut" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="DRAFT">Brouillon</SelectItem>
                      <SelectItem value="PUBLISHED">Publié</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Les camps en brouillon ne sont pas visibles par les parents
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Section: Dates du camp */}
        <Card>
          <CardHeader>
            <CardTitle>Période du camp</CardTitle>
            <CardDescription>
              Définissez les dates de début et de fin du camp
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {/* Date de début */}
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date de début *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormDescription>Premier jour du camp</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Date de fin */}
              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date de fin *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormDescription>Dernier jour du camp</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Prévisualisation du nombre de jours */}
            {daysCount > 0 && (
              <Alert>
                <Calendar className="h-4 w-4" />
                <AlertDescription>
                  <strong>{daysCount} jour{daysCount > 1 ? 's' : ''}</strong> de camp
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Section: Logistique */}
        <Card>
          <CardHeader>
            <CardTitle>Logistique et capacité</CardTitle>
            <CardDescription>
              Informations pratiques sur le camp
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Lieu */}
            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lieu principal *</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Centre de loisirs de Nouméa" {...field} />
                  </FormControl>
                  <FormDescription>
                    Lieu où se déroule le camp
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 md:grid-cols-2">
              {/* Capacité maximale */}
              <FormField
                control={form.control}
                name="maxCapacity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Capacité maximale *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="30"
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormDescription>Nombre max d'enfants (1-200)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Prix total */}
              <FormField
                control={form.control}
                name="totalPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prix total du camp (XPF) *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="10000"
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormDescription>Prix total pour la durée complète du camp</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Date limite inscription */}
            <FormField
              control={form.control}
              name="registrationDeadline"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date limite d'inscription *</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>


        {/* Actions */}
        <ButtonGroup align="right">
          <Button
            type="button"
            variant="outline"
            onClick={() => window.history.back()}
            disabled={isSubmitting}
          >
            Annuler
          </Button>
          <LoadingButton type="submit" loading={isSubmitting}>
            {mode === 'create' ? 'Créer le camp' : 'Enregistrer les modifications'}
          </LoadingButton>
        </ButtonGroup>
      </form>
    </Form>
  );
}
