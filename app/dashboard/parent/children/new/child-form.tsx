'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { trpc } from '@/lib/trpc/client';
import { Loader2 } from 'lucide-react';

// ============================================================================
// SCHEMA - Doit correspondre au schema createChildSchema du router
// ============================================================================

const childFormSchema = z.object({
  firstName: z
    .string()
    .min(2, 'Prénom requis (min 2 caractères)')
    .max(50, 'Maximum 50 caractères')
    .regex(/^[a-zA-ZÀ-ÿ\s-]+$/, 'Caractères alphabétiques uniquement'),
  lastName: z
    .string()
    .min(2, 'Nom requis (min 2 caractères)')
    .max(50, 'Maximum 50 caractères')
    .regex(/^[a-zA-ZÀ-ÿ\s-]+$/, 'Caractères alphabétiques uniquement'),
  birthDate: z.string().min(1, 'Date de naissance requise'),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER'], {
    message: 'Genre requis',
  }),
  medicalNotes: z.string().optional(),
  emergencyContactName: z.string().max(100).optional().or(z.literal('')),
  emergencyContactPhone: z
    .string()
    .regex(/^[\d\s\-\(\)\+]*$/, 'Format téléphone invalide')
    .optional()
    .or(z.literal('')),
  emergencyContactRelation: z.string().optional(),
});

type ChildFormData = z.infer<typeof childFormSchema>;

// ============================================================================
// COMPOSANT
// ============================================================================

export function ChildForm() {
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const createChildMutation = trpc.children.createByParent.useMutation();

  const form = useForm<ChildFormData>({
    resolver: zodResolver(childFormSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      birthDate: '',
      gender: 'MALE',
      medicalNotes: '',
      emergencyContactName: '',
      emergencyContactPhone: '',
      emergencyContactRelation: '',
    },
  });

  async function onSubmit(values: ChildFormData) {
    try {
      setError(null);

      // Convertir birthDate en ISO datetime pour tRPC
      const birthDateISO = new Date(values.birthDate).toISOString();

      await createChildMutation.mutateAsync({
        firstName: values.firstName,
        lastName: values.lastName,
        birthDate: birthDateISO,
        gender: values.gender,
        medicalInfo: {
          allergies: [],
          medications: [],
          conditions: [],
          diet_restrictions: [],
          notes: values.medicalNotes || '',
        },
        emergencyContactName: values.emergencyContactName || undefined,
        emergencyContactPhone: values.emergencyContactPhone || undefined,
        emergencyContactRelation: values.emergencyContactRelation || undefined,
      });

      router.push('/dashboard/parent/children');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Une erreur est survenue');
    }
  }

  return (
    <>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Informations de l'enfant</CardTitle>
          <CardDescription>
            Remplissez les informations concernant votre enfant
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Identité */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Prénom *</FormLabel>
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
                      <FormLabel>Nom *</FormLabel>
                      <FormControl>
                        <Input placeholder="Dupont" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="birthDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date de naissance *</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="gender"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Genre *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="MALE">Garçon</SelectItem>
                          <SelectItem value="FEMALE">Fille</SelectItem>
                          <SelectItem value="OTHER">Autre</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Informations médicales */}
              <div className="border-t pt-6">
                <h3 className="text-lg font-medium mb-4">Informations médicales (optionnel)</h3>

                <FormField
                  control={form.control}
                  name="medicalNotes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes médicales</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Allergies, traitements en cours, conditions médicales particulières..."
                          className="min-h-[100px]"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Indiquez toute information médicale importante (allergies, médicaments, conditions)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Contact d'urgence */}
              <div className="border-t pt-6">
                <h3 className="text-lg font-medium mb-4">Contact d'urgence</h3>

                <div className="grid grid-cols-1 gap-4">
                  <FormField
                    control={form.control}
                    name="emergencyContactName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nom du contact</FormLabel>
                        <FormControl>
                          <Input placeholder="Marie Dupont" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="emergencyContactPhone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Téléphone</FormLabel>
                          <FormControl>
                            <Input placeholder="75 12 34" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="emergencyContactRelation"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Lien de parenté (optionnel)</FormLabel>
                          <FormControl>
                            <Input placeholder="Mère, Père, Tante..." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-4 pt-6">
                <Button type="submit" disabled={createChildMutation.isPending}>
                  {createChildMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Enregistrer l'enfant
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                  disabled={createChildMutation.isPending}
                >
                  Annuler
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </>
  );
}
