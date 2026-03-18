'use client';

/**
 * Camp Days Editor Component
 *
 * Composant réutilisable pour gérer les journées d'un camp.
 * Utilisé dans les formulaires de création et d'édition de camps.
 *
 * Features:
 * - Affichage en cards triées par date
 * - Ajout/Édition via Dialog
 * - Suppression avec confirmation
 * - Validation: au moins 1 journée, dates uniques
 * - Compatible React Hook Form
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { Plus, Calendar, MapPin, Edit2, Trash2, Activity } from 'lucide-react';
import { CampDayDialog } from './camp-day-dialog';

// ============================================================================
// TYPES
// ============================================================================

export type CampDay = {
  date: string; // ISO format YYYY-MM-DD
  theme?: string;
  location?: string;
  maxCapacityOverride?: number;
  activities?: string[];
  notes?: string;
};

export type CampDaysEditorProps = {
  value: CampDay[];
  onChange: (days: CampDay[]) => void;
  disabled?: boolean;
  campLocation?: string; // Location par défaut du camp
  campMaxCapacity?: number; // Capacité par défaut du camp
  error?: string; // Message d'erreur de validation
};

// ============================================================================
// COMPONENT
// ============================================================================

export function CampDaysEditor({
  value,
  onChange,
  disabled = false,
  campLocation,
  campMaxCapacity,
  error,
}: CampDaysEditorProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);

  // Trier les journées par date
  const sortedDays = [...value].sort((a, b) => a.date.localeCompare(b.date));

  // Handlers
  const handleAdd = () => {
    setEditingIndex(null);
    setDialogOpen(true);
  };

  const handleEdit = (index: number) => {
    setEditingIndex(index);
    setDialogOpen(true);
  };

  const handleDelete = (index: number) => {
    setDeleteIndex(index);
  };

  const confirmDelete = () => {
    if (deleteIndex !== null) {
      const newDays = value.filter((_, i) => i !== deleteIndex);
      onChange(newDays);
      setDeleteIndex(null);
    }
  };

  const handleSaveDay = (day: CampDay) => {
    if (editingIndex !== null) {
      // Édition
      const newDays = [...value];
      newDays[editingIndex] = day;
      onChange(newDays);
    } else {
      // Ajout
      onChange([...value, day]);
    }
    setDialogOpen(false);
    setEditingIndex(null);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  return (
    <div className="space-y-4">
      {/* Header avec bouton d'ajout */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Journées du camp</h3>
          <p className="text-sm text-muted-foreground">
            {sortedDays.length} journée{sortedDays.length > 1 ? 's' : ''} programmée
            {sortedDays.length > 1 ? 's' : ''}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAdd}
          disabled={disabled}
        >
          <Plus className="mr-2 h-4 w-4" />
          Ajouter une journée
        </Button>
      </div>

      {/* Message d'erreur */}
      {error && (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Liste des journées */}
      {sortedDays.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-[200px] flex-col items-center justify-center p-8 text-center">
            <Calendar className="h-12 w-12 text-muted-foreground" />
            <h4 className="mt-4 text-lg font-semibold">Aucune journée programmée</h4>
            <p className="mt-2 text-sm text-muted-foreground">
              Commencez par ajouter au moins une journée au camp.
            </p>
            <Button
              type="button"
              onClick={handleAdd}
              disabled={disabled}
              className="mt-6"
            >
              <Plus className="mr-2 h-4 w-4" />
              Ajouter la première journée
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sortedDays.map((day) => {
            const originalIndex = value.findIndex((d) => d.date === day.date);

            return (
              <Card key={day.date} className="relative">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <Badge variant="outline" className="mb-2">
                        <Calendar className="mr-1 h-3 w-3" />
                        {formatDate(day.date)}
                      </Badge>
                      {day.theme && (
                        <CardTitle className="text-base">{day.theme}</CardTitle>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  {/* Location */}
                  {(day.location || campLocation) && (
                    <div className="flex items-start gap-2 text-sm">
                      <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                      <span className="text-muted-foreground">
                        {day.location || campLocation}
                      </span>
                    </div>
                  )}

                  {/* Capacité override */}
                  {day.maxCapacityOverride && (
                    <div className="flex items-center gap-2 text-sm">
                      <Activity className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        Capacité: {day.maxCapacityOverride} enfants
                      </span>
                    </div>
                  )}

                  {/* Activités */}
                  {day.activities && day.activities.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {day.activities.map((activity, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {activity}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* Notes */}
                  {day.notes && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {day.notes}
                    </p>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(originalIndex)}
                      disabled={disabled}
                      className="flex-1"
                    >
                      <Edit2 className="mr-1 h-3 w-3" />
                      Éditer
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(originalIndex)}
                      disabled={disabled || sortedDays.length === 1}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span className="sr-only">Supprimer</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog d'ajout/édition */}
      <CampDayDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={handleSaveDay}
        defaultValues={editingIndex !== null ? value[editingIndex] : undefined}
        existingDates={value
          .filter((_, i) => i !== editingIndex)
          .map((d) => d.date)}
        campLocation={campLocation}
        campMaxCapacity={campMaxCapacity}
        mode={editingIndex !== null ? 'edit' : 'create'}
      />

      {/* Dialog de confirmation de suppression */}
      <AlertDialog open={deleteIndex !== null} onOpenChange={() => setDeleteIndex(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette journée ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. La journée sera définitivement supprimée du camp.
              {deleteIndex !== null && value[deleteIndex] && (
                <span className="mt-2 block font-medium text-foreground">
                  {formatDate(value[deleteIndex].date)}
                  {value[deleteIndex].theme && ` - ${value[deleteIndex].theme}`}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
