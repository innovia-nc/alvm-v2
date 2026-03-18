'use client';

/**
 * Duplicate Camp Dialog
 *
 * Dialog pour dupliquer un camp existant avec:
 * - Nouveau nom du camp
 * - Les dates sont conservées à l'identique
 * - Appel à la mutation trpc.camps.duplicate
 */

import * as React from 'react';
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
import { Button } from '@/components/ui/button';
import { Loader2, Copy } from 'lucide-react';

// ============================================================================
// SCHEMA
// ============================================================================

const duplicateFormSchema = z.object({
  name: z.string().min(3, 'Nom requis (min 3 caractères)').max(200),
});

type DuplicateFormValues = z.infer<typeof duplicateFormSchema>;

// ============================================================================
// TYPES
// ============================================================================

export type DuplicateCampDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: DuplicateFormValues) => void;
  originalCampName: string;
  isSubmitting?: boolean;
};

// ============================================================================
// COMPONENT
// ============================================================================

export function DuplicateCampDialog({
  open,
  onOpenChange,
  onConfirm,
  originalCampName,
  isSubmitting = false,
}: DuplicateCampDialogProps) {
  const form = useForm<DuplicateFormValues>({
    resolver: zodResolver(duplicateFormSchema),
    defaultValues: {
      name: `${originalCampName} (copie)`,
    },
  });

  // Reset form when dialog opens or camp changes
  React.useEffect(() => {
    if (open) {
      form.reset({
        name: `${originalCampName} (copie)`,
      });
    }
  }, [open, originalCampName, form]);

  const handleSubmit = (values: DuplicateFormValues) => {
    onConfirm(values);
  };

  const handleCancel = () => {
    form.reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            Dupliquer le camp
          </DialogTitle>
          <DialogDescription>
            Créer une copie de "{originalCampName}" avec toutes ses informations. Le nouveau camp sera
            créé en mode brouillon avec les mêmes dates que l'original.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            {/* Nom du nouveau camp */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nom du nouveau camp *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ex: Camp d'été Pirates 2026"
                      {...field}
                      autoFocus
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormDescription>
                    Le nom du camp dupliqué (toutes les autres informations seront copiées)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={isSubmitting}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Dupliquer le camp
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
