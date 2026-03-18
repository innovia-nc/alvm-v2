'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { trpc } from '@/lib/trpc/client';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

// ============================================================================
// TYPES
// ============================================================================

interface Registration {
  id: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'WAITLIST';
  childId: string;
  campId: string;
  parentId: string;
  camp: {
    id: string;
    name: string;
    startDate: string | null;
    endDate: string | null;
    daysCount: number;
  };
  child: {
    id: string;
    firstName: string;
    lastName: string;
  };
  parent: {
    firstName: string;
    lastName: string;
    email: string;
  };
}

interface Camp {
  id: string;
  name: string;
  location: string;
  status: string;
}

interface Parent {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface RegistrationEditFormProps {
  registration: Registration;
  camps: Camp[];
  parents: Parent[];
}

// ============================================================================
// SCHEMA
// ============================================================================

const registrationEditSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'WAITLIST']),
});

type RegistrationEditFormData = z.infer<typeof registrationEditSchema>;

// ============================================================================
// COMPOSANT
// ============================================================================

export function RegistrationEditForm({
  registration,
}: RegistrationEditFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<RegistrationEditFormData>({
    resolver: zodResolver(registrationEditSchema),
    defaultValues: {
      status: registration.status,
    },
  });

  const updateMutation = trpc.registrations.updateByStaff.useMutation();

  async function onSubmit(data: RegistrationEditFormData) {
    try {
      setError(null);

      await updateMutation.mutateAsync({
        id: registration.id,
        status: data.status,
      });

      toast.success('Inscription modifiée avec succès');
      router.push(`/dashboard/admin/registrations/${registration.id}`);
      router.refresh();
    } catch (err: any) {
      const errorMessage = err.message || 'Une erreur est survenue';
      setError(errorMessage);
      toast.error(errorMessage);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Informations non modifiables */}
        <div className="space-y-4 rounded-lg border p-4 bg-muted/50">
          <h3 className="font-semibold">Informations de l'inscription</h3>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Parent</p>
              <p className="text-sm">
                {registration.parent.firstName} {registration.parent.lastName}
              </p>
              <p className="text-xs text-muted-foreground">{registration.parent.email}</p>
            </div>

            <div>
              <p className="text-sm font-medium text-muted-foreground">Enfant</p>
              <p className="text-sm">
                {registration.child.firstName} {registration.child.lastName}
              </p>
            </div>

            <div className="col-span-2">
              <p className="text-sm font-medium text-muted-foreground">Camp</p>
              <p className="text-sm">{registration.camp.name}</p>
              <p className="text-xs text-muted-foreground">
                {registration.camp.startDate && registration.camp.endDate ? (
                  <>
                    Du {new Date(registration.camp.startDate).toLocaleDateString('fr-FR')} au{' '}
                    {new Date(registration.camp.endDate).toLocaleDateString('fr-FR')} ({registration.camp.daysCount} jours)
                  </>
                ) : (
                  <>Dates non définies ({registration.camp.daysCount} jours)</>
                )}
              </p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground mt-2">
            Ces informations ne peuvent pas être modifiées. Pour changer le camp ou l'enfant,
            créez une nouvelle inscription.
          </p>
        </div>

        {/* Statut modifiable */}
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Statut de l'inscription</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un statut" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="PENDING">En attente</SelectItem>
                  <SelectItem value="CONFIRMED">Confirmée</SelectItem>
                  <SelectItem value="WAITLIST">Liste d'attente</SelectItem>
                  <SelectItem value="CANCELLED">Annulée</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>
                Changer le statut de l'inscription
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Actions */}
        <div className="flex gap-4">
          <Button
            type="submit"
            disabled={updateMutation.isPending || !form.formState.isDirty}
          >
            {updateMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            <Save className="mr-2 h-4 w-4" />
            Enregistrer
          </Button>

          <Button type="button" variant="outline" asChild>
            <Link href={`/dashboard/admin/registrations/${registration.id}`}>
              <X className="mr-2 h-4 w-4" />
              Annuler
            </Link>
          </Button>
        </div>
      </form>
    </Form>
  );
}
