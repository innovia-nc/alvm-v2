'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';

// Schéma validation inscription parent
const signUpParentSchema = z
  .object({
    // Informations compte
    email: z
      .string()
      .min(1, 'Email requis')
      .email('Email invalide')
      .toLowerCase(),
    password: z
      .string()
      .min(8, 'Minimum 8 caractères')
      .regex(/[A-Z]/, 'Au moins une majuscule')
      .regex(/[a-z]/, 'Au moins une minuscule')
      .regex(/[0-9]/, 'Au moins un chiffre'),
    confirmPassword: z.string().min(8, 'Confirmation requise'),

    // Informations personnelles
    firstName: z
      .string()
      .min(2, 'Minimum 2 caractères')
      .max(50, 'Maximum 50 caractères')
      .regex(/^[a-zA-ZÀ-ÿ\s-]+$/, 'Caractères alphabétiques uniquement'),
    lastName: z
      .string()
      .min(2, 'Minimum 2 caractères')
      .max(50, 'Maximum 50 caractères')
      .regex(/^[a-zA-ZÀ-ÿ\s-]+$/, 'Caractères alphabétiques uniquement'),
    phone: z
      .string()
      .min(6, 'Téléphone requis')
      .regex(/^[\d\s\-\(\)\+]+$/, 'Format téléphone invalide'),

    // Adresse
    address: z.string().min(5, 'Adresse complète requise'),
    city: z.string().min(2, 'Ville requise'),
    postalCode: z
      .string()
      .length(5, 'Code postal doit contenir 5 chiffres')
      .regex(/^\d{5}$/, 'Format invalide (ex: 98800)'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  });

type SignUpParentFormValues = z.infer<typeof signUpParentSchema>;

export function SignUpParentForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<SignUpParentFormValues>({
    resolver: zodResolver(signUpParentSchema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
      firstName: '',
      lastName: '',
      phone: '',
      address: '',
      city: '',
      postalCode: '',
    },
    mode: 'onBlur', // Validation on blur pour meilleure UX
  });

  async function onSubmit(data: SignUpParentFormValues) {
    setIsLoading(true);
    setError(null);

    try {
      // 1. Créer compte via API custom /api/auth/signup
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: data.email,
          password: data.password,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          address: data.address,
          city: data.city,
          postalCode: data.postalCode,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        // Gérer les erreurs de l'API
        const errorMessages: Record<string, string> = {
          'Un compte avec cet email existe déjà': 'Cet email est déjà utilisé',
          'Données invalides': 'Veuillez vérifier les informations saisies',
        };

        setError(errorMessages[result.error] || result.error || 'Erreur lors de la création du compte');
        return;
      }

      // 2. Succès - Connecter automatiquement l'utilisateur
      setSuccess(true);

      // Auto sign-in après inscription
      await signIn('credentials', {
        email: data.email,
        password: data.password,
        redirect: false,
      });

      // Redirection après 2 secondes
      setTimeout(() => {
        router.push('/dashboard/parent');
        router.refresh();
      }, 2000);
    } catch (err) {
      console.error('Sign up error:', err);
      setError('Erreur inattendue. Veuillez réessayer.');
    } finally {
      setIsLoading(false);
    }
  }

  // Message succès
  if (success) {
    return (
      <Alert className="bg-green-50 border-green-200">
        <CheckCircle2 className="h-4 w-4 text-green-600" />
        <AlertDescription className="text-green-800">
          <strong>Compte créé avec succès !</strong>
          <br />
          Connexion automatique en cours...
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Erreur globale */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Section Compte */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Informations de connexion</h3>

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="votre.email@exemple.com"
                    autoComplete="email"
                    autoFocus
                    disabled={isLoading}
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Cette adresse sera utilisée pour vous connecter
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Mot de passe</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    autoComplete="new-password"
                    disabled={isLoading}
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Minimum 8 caractères avec majuscule, minuscule et chiffre
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirmer le mot de passe</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    autoComplete="new-password"
                    disabled={isLoading}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Section Identité */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Informations personnelles</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="firstName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prénom</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Jean"
                      autoComplete="given-name"
                      disabled={isLoading}
                      {...field}
                    />
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
                    <Input
                      placeholder="Dupont"
                      autoComplete="family-name"
                      disabled={isLoading}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Téléphone</FormLabel>
                <FormControl>
                  <Input
                    type="tel"
                    placeholder="+687 12 34 56"
                    autoComplete="tel"
                    disabled={isLoading}
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Nous utiliserons ce numéro pour vous contacter en cas d&apos;urgence
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Section Adresse */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Adresse</h3>

          <FormField
            control={form.control}
            name="address"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Adresse complète</FormLabel>
                <FormControl>
                  <Input
                    placeholder="12 rue de la Baie"
                    autoComplete="street-address"
                    disabled={isLoading}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ville</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Nouméa"
                      autoComplete="address-level2"
                      disabled={isLoading}
                      {...field}
                    />
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
                    <Input
                      placeholder="98800"
                      autoComplete="postal-code"
                      disabled={isLoading}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Submit */}
        <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Création en cours...
            </>
          ) : (
            'Créer mon compte'
          )}
        </Button>

        {/* CGU */}
        <p className="text-xs text-center text-gray-500">
          En créant un compte, vous acceptez nos{' '}
          <a href="/cgu" className="text-indigo-600 hover:underline">
            Conditions Générales d&apos;Utilisation
          </a>
          .
        </p>
      </form>
    </Form>
  );
}
