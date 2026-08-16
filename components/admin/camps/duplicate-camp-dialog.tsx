'use client';

/**
 * Duplicate Camp Dialog
 *
 * Dialog pour dupliquer un ACM existant avec:
 * - Nouveau nom
 * - Choix optionnel d'un nouveau type d'ACM
 * - Les autres infos (dates, lieu, capacité, prix) sont conservées
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Copy } from 'lucide-react';

const duplicateFormSchema = z.object({
  name: z.string().min(3, 'Nom requis (min 3 caractères)').max(200),
  campTypeId: z.string().uuid("Type d'ACM requis"),
});

export type DuplicateFormValues = z.infer<typeof duplicateFormSchema>;

type CampTypeOption = {
  id: string;
  name: string;
};

type DuplicateCampDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: DuplicateFormValues) => void;
  originalCampName: string;
  originalCampTypeId: string;
  campTypes: CampTypeOption[];
  isSubmitting?: boolean;
};

export function DuplicateCampDialog({
  open,
  onOpenChange,
  onConfirm,
  originalCampName,
  originalCampTypeId,
  campTypes,
  isSubmitting = false,
}: DuplicateCampDialogProps) {
  const form = useForm<DuplicateFormValues>({
    resolver: zodResolver(duplicateFormSchema),
    defaultValues: {
      name: `${originalCampName} (copie)`,
      campTypeId: originalCampTypeId,
    },
  });

  React.useEffect(() => {
    if (open) {
      form.reset({
        name: `${originalCampName} (copie)`,
        campTypeId: originalCampTypeId,
      });
    }
  }, [open, originalCampName, originalCampTypeId, form]);

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
            Dupliquer l&apos;ACM
          </DialogTitle>
          <DialogDescription>
            Créer une copie de &quot;{originalCampName}&quot; avec les mêmes dates, le même lieu
            et la même capacité. Le nouvel ACM sera créé en mode brouillon.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nom du nouvel ACM *</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ex: Camp d'été Pirates 2026"
                      {...field}
                      autoFocus
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormDescription>
                    Le nom de l&apos;ACM dupliqué
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="campTypeId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type d&apos;ACM *</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={isSubmitting || campTypes.length === 0}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionnez un type" />
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
                    Vous pouvez changer le type de l&apos;ACM lors de la duplication
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
                Dupliquer
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
