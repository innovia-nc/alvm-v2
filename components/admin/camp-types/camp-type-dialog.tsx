'use client';

/**
 * Camp Type Dialog
 *
 * Dialog réutilisable pour créer ou modifier un type de camp.
 * Validation Zod + React Hook Form + tRPC mutations
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
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { toast } from 'sonner';

// ============================================================================
// SCHEMA
// ============================================================================

const campTypeFormSchema = z.object({
  name: z.string().min(2, 'Nom requis (min 2 caractères)').max(100, 'Nom trop long (max 100)'),
  description: z.string().optional(),
  accountingCode: z
    .string()
    .regex(/^\d{6}$/, 'Code comptable invalide (doit être 6 chiffres)')
    .optional()
    .or(z.literal('')),
});

type CampTypeFormValues = z.infer<typeof campTypeFormSchema>;

// ============================================================================
// TYPES
// ============================================================================

type CampType = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  accountingCode: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CampTypeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClose: () => void;
  mode: 'create' | 'edit';
  campType?: CampType;
};

// ============================================================================
// COMPONENT
// ============================================================================

export function CampTypeDialog({
  open,
  onOpenChange,
  onClose,
  mode,
  campType,
}: CampTypeDialogProps) {
  const utils = trpc.useUtils();

  // Form setup
  const form = useForm<CampTypeFormValues>({
    resolver: zodResolver(campTypeFormSchema),
    defaultValues: {
      name: '',
      description: '',
      accountingCode: '',
    },
  });

  // Reset form when dialog opens or camp type changes
  React.useEffect(() => {
    if (open) {
      if (mode === 'edit' && campType) {
        form.reset({
          name: campType.name,
          description: campType.description || '',
          accountingCode: campType.accountingCode || '',
        });
      } else {
        form.reset({
          name: '',
          description: '',
          accountingCode: '',
        });
      }
    }
  }, [open, mode, campType, form]);

  // Create mutation
  const createMutation = trpc.campTypes.create.useMutation({
    onSuccess: (data) => {
      utils.campTypes.listAll.invalidate();
      toast.success('Type de camp créé', {
        description: `Le type "${data.name}" a été créé avec succès.`,
      });
      form.reset();
      onClose();
    },
    onError: (error) => {
      toast.error('Erreur lors de la création', {
        description: error.message,
      });
    },
  });

  // Update mutation
  const updateMutation = trpc.campTypes.update.useMutation({
    onSuccess: (data) => {
      utils.campTypes.listAll.invalidate();
      toast.success('Type de camp modifié', {
        description: `Le type "${data.name}" a été mis à jour.`,
      });
      form.reset();
      onClose();
    },
    onError: (error) => {
      toast.error('Erreur lors de la modification', {
        description: error.message,
      });
    },
  });

  // Submit handler
  const onSubmit = (values: CampTypeFormValues) => {
    // Clean accountingCode: convert empty string to undefined
    const cleanedValues = {
      ...values,
      accountingCode: values.accountingCode?.trim() || undefined,
      description: values.description?.trim() || undefined,
    };

    if (mode === 'create') {
      createMutation.mutate(cleanedValues);
    } else if (mode === 'edit' && campType) {
      updateMutation.mutate({
        id: campType.id,
        ...cleanedValues,
      });
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Créer un type de camp' : 'Modifier le type de camp'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Ajoutez un nouveau type de camp pour catégoriser vos activités.'
              : `Modifiez les informations du type de camp "${campType?.name}".`}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Nom */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nom du type *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ex: Multi-activités, Sport, Nature..."
                      {...field}
                      autoFocus
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormDescription>
                    Nom affiché publiquement (2-100 caractères)
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
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Décrivez le type de camp, les activités typiques, etc."
                      className="min-h-[100px]"
                      {...field}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormDescription>
                    Description optionnelle visible par les parents
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Code comptable */}
            <FormField
              control={form.control}
              name="accountingCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Code comptable FEC</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="706100"
                      maxLength={6}
                      {...field}
                      disabled={isSubmitting}
                      className="font-mono"
                    />
                  </FormControl>
                  <FormDescription>
                    Code comptable à 6 chiffres pour l'export FEC (optionnel)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mode === 'create' ? 'Créer le type' : 'Enregistrer'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
