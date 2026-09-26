'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Eye, EyeOff, Loader2 } from 'lucide-react';

// Schéma validation Zod
const signInSchema = z.object({
  email: z.string().min(1, 'Email requis').email('Email invalide').toLowerCase(),
  password: z.string().min(6, 'Mot de passe doit contenir au moins 6 caractères'),
});

type SignInFormValues = z.infer<typeof signInSchema>;

export function SignInForm({ superAdmin = false }: { superAdmin?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedUrl = searchParams.get('callbackUrl');
  const callbackUrl = superAdmin
    ? '/dashboard/super-admin'
    : requestedUrl?.startsWith('/dashboard') && !requestedUrl.startsWith('//')
      ? requestedUrl
      : '/dashboard';

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<SignInFormValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: {
      email: '',
      password: '',
    },
    mode: 'onBlur', // Validation on blur pour meilleure UX
  });

  async function onSubmit(data: SignInFormValues) {
    setIsLoading(true);
    setError(null);

    try {
      // Utiliser NextAuth signIn
      const result = await signIn('credentials', {
        portal: superAdmin ? 'super-admin' : 'standard',
        email: data.email,
        password: data.password,
        redirect: false, // Gérer la redirection manuellement
      });

      if (result?.error) {
        // Messages d'erreur localisés
        const errorMessages: Record<string, string> = {
          CredentialsSignin: 'Email ou mot de passe incorrect',
          Configuration: 'Erreur de configuration du serveur',
          AccessDenied: 'Accès refusé',
        };

        setError(errorMessages[result.error] || 'Erreur de connexion. Veuillez réessayer.');
        return;
      }

      if (result?.ok) {
        // Connexion réussie - rediriger vers callback URL ou dashboard
        router.push(callbackUrl);
        router.refresh(); // Refresh server components
      }
    } catch (err) {
      console.error('Sign in error:', err);
      setError('Erreur inattendue. Veuillez réessayer.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" aria-busy={isLoading}>
        {/* Erreur globale */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Email */}
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
                  autoCapitalize="none"
                  spellCheck={false}
                  autoFocus
                  disabled={isLoading}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Password */}
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Mot de passe</FormLabel>
              <div className="relative">
                <FormControl>
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    className="pr-12"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    disabled={isLoading}
                    {...field}
                  />
                </FormControl>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0"
                  disabled={isLoading}
                  aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </Button>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Submit */}
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Connexion en cours...
            </>
          ) : (
            'Se connecter'
          )}
        </Button>
      </form>
    </Form>
  );
}
