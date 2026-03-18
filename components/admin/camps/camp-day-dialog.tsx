'use client';

/**
 * Camp Day Dialog Component
 *
 * Dialog pour ajouter ou éditer une journée de camp.
 * Formulaire avec validation Zod + React Hook Form.
 */

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import { CampDay } from './camp-days-editor';

// ============================================================================
// SCHEMA
// ============================================================================

const campDaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format de date invalide (YYYY-MM-DD)'),
  theme: z.string().optional(),
  location: z.string().optional(),
  maxCapacityOverride: z.number().int().positive('Doit être un nombre positif').optional(),
  activities: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

type CampDayFormValues = z.infer<typeof campDaySchema>;

// ============================================================================
// COMPONENT PROPS
// ============================================================================

type CampDayDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (day: CampDay) => void;
  defaultValues?: CampDay;
  existingDates: string[]; // Dates déjà utilisées (pour validation unicité)
  campLocation?: string;
  campMaxCapacity?: number;
  mode: 'create' | 'edit';
};

// ============================================================================
// COMPONENT
// ============================================================================

export function CampDayDialog({
  open,
  onOpenChange,
  onSave,
  defaultValues,
  existingDates,
  campLocation,
  campMaxCapacity,
  mode,
}: CampDayDialogProps) {
  const [activityInput, setActivityInput] = useState('');

  const form = useForm<CampDayFormValues>({
    resolver: zodResolver(campDaySchema),
    defaultValues: defaultValues || {
      activities: [],
    },
  });

  // Reset form quand le dialog s'ouvre/ferme
  useEffect(() => {
    if (open) {
      form.reset(
        defaultValues || {
          activities: [],
        }
      );
      setActivityInput('');
    }
  }, [open, defaultValues, form]);

  // Validation personnalisée pour date unique
  const validateDateUnique = (date: string) => {
    return !existingDates.includes(date);
  };

  const onSubmit = (data: CampDayFormValues) => {
    // Validation date unique
    if (!validateDateUnique(data.date)) {
      form.setError('date', {
        type: 'manual',
        message: 'Cette date est déjà utilisée pour une autre journée',
      });
      return;
    }

    // Nettoyer les valeurs optionnelles vides
    const cleanedData: CampDay = {
      date: data.date,
      ...(data.theme && data.theme.trim() && { theme: data.theme.trim() }),
      ...(data.location && data.location.trim() && { location: data.location.trim() }),
      ...(data.maxCapacityOverride && { maxCapacityOverride: data.maxCapacityOverride }),
      ...(data.activities && data.activities.length > 0 && { activities: data.activities }),
      ...(data.notes && data.notes.trim() && { notes: data.notes.trim() }),
    };

    onSave(cleanedData);
    form.reset();
  };

  // Gestion des activités
  const activities = form.watch('activities') || [];

  const handleAddActivity = () => {
    if (activityInput.trim()) {
      const currentActivities = form.getValues('activities') || [];
      form.setValue('activities', [...currentActivities, activityInput.trim()]);
      setActivityInput('');
    }
  };

  const handleRemoveActivity = (index: number) => {
    const currentActivities = form.getValues('activities') || [];
    form.setValue(
      'activities',
      currentActivities.filter((_, i) => i !== index)
    );
  };

  const handleActivityKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddActivity();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Ajouter une journée' : 'Éditer la journée'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Remplissez les informations pour cette journée de camp.'
              : 'Modifiez les informations de cette journée.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Date */}
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date *</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormDescription>
                    Date de la journée (doit être unique)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Thème */}
            <FormField
              control={form.control}
              name="theme"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Thème de la journée</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Pirates des Caraïbes" {...field} />
                  </FormControl>
                  <FormDescription>
                    Thème ou titre de la journée (optionnel)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Location */}
            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lieu spécifique</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={
                        campLocation
                          ? `Laisser vide pour utiliser "${campLocation}"`
                          : 'Ex: Plage de l\'Anse Vata'
                      }
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Lieu spécifique pour cette journée (optionnel, sinon lieu du camp)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Capacité override */}
            <FormField
              control={form.control}
              name="maxCapacityOverride"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Capacité maximale spécifique</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      placeholder={
                        campMaxCapacity
                          ? `Laisser vide pour utiliser ${campMaxCapacity}`
                          : 'Ex: 20'
                      }
                      {...field}
                      onChange={(e) =>
                        field.onChange(e.target.value ? parseInt(e.target.value) : undefined)
                      }
                      value={field.value || ''}
                    />
                  </FormControl>
                  <FormDescription>
                    Capacité spécifique pour cette journée (optionnel, sinon capacité du camp)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Activités */}
            <FormField
              control={form.control}
              name="activities"
              render={() => (
                <FormItem>
                  <FormLabel>Activités prévues</FormLabel>
                  <FormControl>
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Input
                          placeholder="Ex: Natation, Artisanat..."
                          value={activityInput}
                          onChange={(e) => setActivityInput(e.target.value)}
                          onKeyDown={handleActivityKeyDown}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleAddActivity}
                          disabled={!activityInput.trim()}
                        >
                          Ajouter
                        </Button>
                      </div>

                      {activities.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {activities.map((activity, index) => (
                            <Badge key={index} variant="secondary" className="gap-1">
                              {activity}
                              <button
                                type="button"
                                onClick={() => handleRemoveActivity(index)}
                                className="ml-1 rounded-full hover:bg-destructive hover:text-destructive-foreground"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </FormControl>
                  <FormDescription>
                    Liste des activités prévues pour cette journée (optionnel)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Notes ou remarques particulières pour cette journée..."
                      className="min-h-[100px]"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Notes internes ou remarques pour cette journée (optionnel)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Annuler
              </Button>
              <Button type="submit">
                {mode === 'create' ? 'Ajouter la journée' : 'Enregistrer les modifications'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
