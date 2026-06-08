'use client';

/**
 * User Form Component
 *
 * Formulaire générique pour la création et l'édition d'utilisateurs.
 * Utilisé dans /dashboard/admin/users/new et /dashboard/admin/users/[id]/edit
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Schema du profil parent
 */
const parentProfileSchema = z.object({
  firstName: z.string().min(2, 'Minimum 2 caractères').optional(),
  lastName: z.string().min(2, 'Minimum 2 caractères').optional(),
  phone: z.string().min(6, 'Numéro de téléphone invalide').optional(),
  email: z.string().email('Email invalide').optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
});

/**
 * Schema du profil staff
 */
const staffProfileSchema = z.object({
  firstName: z.string().min(2, 'Minimum 2 caractères').optional(),
  lastName: z.string().min(2, 'Minimum 2 caractères').optional(),
  phone: z
    .string()
    .refine(
      (val) => !val || val.length >= 6,
      'Numéro de téléphone invalide'
    )
    .optional(),
  email: z.string().email('Email invalide').optional(),
});

/**
 * Schema du formulaire utilisateur
 */
const userFormSchema = z
  .object({
    email: z.string().email('Email invalide'),
    name: z.string().min(2, 'Nom requis (min 2 caractères)').max(100),
    role: z.enum(['PARENT', 'STAFF', 'ADMIN']),
    password: z
      .string()
      .min(8, 'Minimum 8 caractères')
      .regex(/[A-Z]/, 'Au moins une majuscule')
      .regex(/[a-z]/, 'Au moins une minuscule')
      .regex(/[0-9]/, 'Au moins un chiffre')
      .optional(),
    parentProfile: parentProfileSchema.optional(),
    staffProfile: staffProfileSchema.optional(),
  })
  .refine(
    (data) => {
      if (data.role === 'PARENT') {
        return !!data.parentProfile?.firstName && !!data.parentProfile?.lastName;
      }
      return true;
    },
    {
      message: 'Prénom et nom du parent sont requis',
      path: ['parentProfile'],
    }
  )
  .refine(
    (data) => {
      if (data.role === 'STAFF') {
        return !!data.staffProfile?.firstName && !!data.staffProfile?.lastName;
      }
      return true;
    },
    {
      message: 'Prénom et nom du staff sont requis',
      path: ['staffProfile'],
    }
  );

export type UserFormValues = z.infer<typeof userFormSchema>;

// ============================================================================
// COMPONENT PROPS
// ============================================================================

type UserFormProps = {
  defaultValues?: Partial<UserFormValues>;
  onSubmit: (data: UserFormValues) => void;
  isSubmitting?: boolean;
  mode: 'create' | 'edit';
};

// ============================================================================
// COMPONENT
// ============================================================================

export function UserForm({ defaultValues, onSubmit, isSubmitting = false, mode }: UserFormProps) {
  // En mode édition, les champs du profil sont plus permissifs
  // En mode création, ils doivent être complets via les validations refine
  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: defaultValues || {
      role: 'PARENT',
    },
  });

  const selectedRole = form.watch('role');

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Section: Informations de compte */}
        <Card>
          <CardHeader>
            <CardTitle>Informations du compte</CardTitle>
            <CardDescription>
              Informations de connexion et rôle de l'utilisateur
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Email */}
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email *</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="utilisateur@example.com"
                      {...field}
                      disabled={mode === 'edit'}
                    />
                  </FormControl>
                  <FormDescription>
                    {mode === 'create'
                      ? "Email utilisé pour la connexion (ne peut pas être modifié après création)"
                      : "Email de connexion (non modifiable)"}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nom d'affichage *</FormLabel>
                  <FormControl>
                    <Input placeholder="Jean Dupont" {...field} />
                  </FormControl>
                  <FormDescription>Nom affiché dans l'application</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Password (création seulement) */}
            {mode === 'create' && (
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mot de passe *</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} />
                    </FormControl>
                    <FormDescription>
                      8 caractères min, avec majuscule, minuscule et chiffre
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Role */}
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rôle *</FormLabel>
                  <Select
                    onValueChange={(value: string) => {
                      field.onChange(value);
                      // Reset profiles when role changes
                      form.setValue('parentProfile', undefined);
                      form.setValue('staffProfile', undefined);
                    }}
                    defaultValue={field.value}
                    disabled={mode === 'edit'}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionnez un rôle" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="PARENT">Parent</SelectItem>
                      <SelectItem value="STAFF">Personnel</SelectItem>
                      <SelectItem value="ADMIN">Administrateur</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    {mode === 'create'
                      ? "Rôle de l'utilisateur (ne peut pas être modifié après création)"
                      : "Rôle de l'utilisateur (non modifiable)"}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Section: Profil Parent */}
        {selectedRole === 'PARENT' && (
          <Card>
            <CardHeader>
              <CardTitle>Profil Parent / Client</CardTitle>
              <CardDescription>Informations du responsable légal</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="parentProfile.firstName"
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
                  name="parentProfile.lastName"
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

              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="parentProfile.phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Téléphone *</FormLabel>
                      <FormControl>
                        <Input placeholder="75.12.34" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="parentProfile.email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email personnel</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="jean.dupont@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="parentProfile.address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Adresse</FormLabel>
                    <FormControl>
                      <Input placeholder="12 rue des Lilas" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="parentProfile.city"
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
                  name="parentProfile.postalCode"
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
            </CardContent>
          </Card>
        )}

        {/* Section: Profil Staff */}
        {selectedRole === 'STAFF' && (
          <Card>
            <CardHeader>
              <CardTitle>Profil Personnel</CardTitle>
              <CardDescription>Informations du membre du personnel</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="staffProfile.firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Prénom *</FormLabel>
                      <FormControl>
                        <Input placeholder="Marie" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="staffProfile.lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nom *</FormLabel>
                      <FormControl>
                        <Input placeholder="Martin" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="staffProfile.phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Téléphone</FormLabel>
                      <FormControl>
                        <Input placeholder="75.12.34" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="staffProfile.email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email personnel</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="marie.martin@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-4">
          <Button type="button" variant="outline" onClick={() => window.history.back()}>
            Annuler
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === 'create' ? 'Créer l\'utilisateur' : 'Enregistrer les modifications'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
