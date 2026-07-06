'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { LoadingButton } from '@/components/ui/loading-button';
import { ButtonGroup } from '@/components/ui/button-group';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Save, X } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { useDashboardBasePath } from '@/lib/hooks/use-dashboard-base-path';

// ============================================================================
// TYPES
// ============================================================================

interface Parent {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  homePhone?: string | null;
  workPhone?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  employeur?: string | null;
  fonction?: string | null;
}

interface ParentEditFormProps {
  parent: Parent;
}

// ============================================================================
// SCHEMA
// ============================================================================

const parentEditSchema = z.object({
  firstName: z.string().min(1, 'Prénom requis'),
  lastName: z.string().min(1, 'Nom requis'),
  email: z.string().email('Email invalide'),
  phone: z.string().min(1, 'Téléphone requis'),
  homePhone: z.string().optional(),
  workPhone: z.string().optional(),
  address: z.string().default(''),
  city: z.string().default(''),
  postalCode: z.string().default(''),
  employeur: z.string().max(100, 'Maximum 100 caractères').default(''),
  fonction: z.string().max(100, 'Maximum 100 caractères').default(''),
});

type ParentEditFormData = z.infer<typeof parentEditSchema>;

// ============================================================================
// COMPOSANT
// ============================================================================

export function ParentEditForm({ parent }: ParentEditFormProps) {
  const router = useRouter();
  const basePath = useDashboardBasePath();
  const parentsPath =
    basePath === '/dashboard/admin' ? '/dashboard/admin/users/parents' : `${basePath}/parents`;
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    resolver: zodResolver(parentEditSchema),
    defaultValues: {
      firstName: parent.firstName,
      lastName: parent.lastName,
      email: parent.email,
      phone: parent.phone,
      homePhone: parent.homePhone || '',
      workPhone: parent.workPhone || '',
      address: parent.address || '',
      city: parent.city || '',
      postalCode: parent.postalCode || '',
      employeur: parent.employeur || '',
      fonction: parent.fonction || '',
    },
  });

  const updateMutation = trpc.parents.updateByStaff.useMutation();

  async function onSubmit(data: ParentEditFormData) {
    try {
      setError(null);

      await updateMutation.mutateAsync({
        id: parent.id,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        homePhone: data.homePhone,
        workPhone: data.workPhone,
        address: data.address,
        city: data.city,
        postalCode: data.postalCode,
        employeur: data.employeur,
        fonction: data.fonction,
      });

      toast.success('Parent modifié avec succès');
      router.push(`${parentsPath}/${parent.id}`);
      router.refresh();
    } catch (err) {
      const errorMessage = err instanceof Error && err.message ? err.message : 'Une erreur est survenue';
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

        <div className="grid gap-6 md:grid-cols-2">
          <FormField
            control={form.control}
            name="firstName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Prénom</FormLabel>
                <FormControl>
                  <Input placeholder="Jean" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="lastName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nom</FormLabel>
                <FormControl>
                  <Input placeholder="Dupont" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="jean.dupont@example.com" {...field} />
                </FormControl>
                <FormDescription>
                  L'email est utilisé pour se connecter
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Téléphone Mobile</FormLabel>
                <FormControl>
                  <Input type="tel" placeholder="+687 12 34 56" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="homePhone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Téléphone Domicile</FormLabel>
                <FormControl>
                  <Input type="tel" placeholder="Optionnel" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="workPhone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Téléphone Professionnel</FormLabel>
                <FormControl>
                  <Input type="tel" placeholder="Optionnel" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="employeur"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Employeur (optionnel)</FormLabel>
                <FormControl>
                  <Input placeholder="Nom de l'entreprise" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="fonction"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fonction (optionnel)</FormLabel>
                <FormControl>
                  <Input placeholder="Ex: Comptable, Enseignant..." {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Adresse (optionnel)</h3>

          <FormField
            control={form.control}
            name="address"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Adresse</FormLabel>
                <FormControl>
                  <Input placeholder="123 Rue de la Paix" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid gap-6 md:grid-cols-2">
            <FormField
              control={form.control}
              name="city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ville</FormLabel>
                  <FormControl>
                    <Input placeholder="Nouméa" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="postalCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Code postal</FormLabel>
                  <FormControl>
                    <Input placeholder="98800" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <ButtonGroup align="right">
          <Button type="button" variant="outline" asChild>
            <Link href={`${parentsPath}/${parent.id}`}>
              <X className="mr-2 h-4 w-4" />
              Annuler
            </Link>
          </Button>

          <LoadingButton
            type="submit"
            loading={updateMutation.isPending}
            disabled={!form.formState.isDirty}
          >
            <Save className="mr-2 h-4 w-4" />
            Enregistrer
          </LoadingButton>
        </ButtonGroup>
      </form>
    </Form>
  );
}
