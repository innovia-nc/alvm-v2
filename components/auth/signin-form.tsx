'use client';

import { useEffect, useState } from 'react';
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
import { AlertCircle, Building2, Eye, EyeOff, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { useDebounce } from '@/lib/hooks/use-debounce';
import {
  LAST_ORGANIZATION_KEY,
  ORGANIZATION_SLUG_PATTERN,
  normalizeOrganizationSlug,
} from '@/lib/organization-slug';

// Schéma validation Zod. L'espace n'est demandé que sur le portail habituel :
// un compte SUPER_ADMIN vit dans l'espace de plateforme.
const signInSchema = z.object({
  organization: z.string(),
  email: z.string().min(1, 'Email requis').email('Email invalide').toLowerCase(),
  password: z.string().min(6, 'Mot de passe doit contenir au moins 6 caractères'),
});

type SignInFormValues = z.infer<typeof signInSchema>;

function readLastOrganization(): string {
  try {
    return window.localStorage.getItem(LAST_ORGANIZATION_KEY) ?? '';
  } catch {
    return '';
  }
}

function rememberOrganization(slug: string) {
  try {
    window.localStorage.setItem(LAST_ORGANIZATION_KEY, slug);
  } catch {
    // Stockage indisponible (navigation privée) : simple confort perdu.
  }
}

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
    resolver: zodResolver(
      signInSchema.refine(
        (values) =>
          superAdmin ||
          ORGANIZATION_SLUG_PATTERN.test(normalizeOrganizationSlug(values.organization)),
        { path: ['organization'], message: 'Identifiant d’espace requis (ex. : mon-association)' },
      ),
    ),
    defaultValues: {
      organization: '',
      email: '',
      password: '',
    },
    mode: 'onBlur', // Validation on blur pour meilleure UX
  });

  // Espace prérempli : lien d'une association (`?org=`) puis dernier espace utilisé.
  const requestedOrganization = searchParams.get('org');
  useEffect(() => {
    if (superAdmin) return;
    const initial = normalizeOrganizationSlug(requestedOrganization ?? readLastOrganization());
    if (initial) form.setValue('organization', initial);
  }, [superAdmin, requestedOrganization, form]);

  const typedOrganization = normalizeOrganizationSlug(form.watch('organization'));
  const organizationSlug = useDebounce(typedOrganization, 300);
  const organization = trpc.organizations.publicInfo.useQuery(
    { slug: organizationSlug },
    {
      enabled: !superAdmin && ORGANIZATION_SLUG_PATTERN.test(organizationSlug),
      retry: false,
      staleTime: 60_000,
    },
  );

  async function onSubmit(data: SignInFormValues) {
    setIsLoading(true);
    setError(null);
    const organizationValue = normalizeOrganizationSlug(data.organization);

    try {
      // Utiliser NextAuth signIn
      const result = await signIn('credentials', {
        portal: superAdmin ? 'super-admin' : 'standard',
        ...(superAdmin ? {} : { organization: organizationValue }),
        email: data.email,
        password: data.password,
        redirect: false, // Gérer la redirection manuellement
      });

      if (result?.error) {
        // Messages d'erreur localisés. Un espace inconnu ou suspendu n'est pas
        // distingué d'identifiants erronés (pas d'énumération des associations).
        const errorMessages: Record<string, string> = {
          CredentialsSignin: superAdmin
            ? 'Email ou mot de passe incorrect'
            : 'Espace, email ou mot de passe incorrect',
          Configuration: 'Erreur de configuration du serveur',
          AccessDenied: 'Accès refusé',
        };

        setError(errorMessages[result.error] || 'Erreur de connexion. Veuillez réessayer.');
        return;
      }

      if (result?.ok) {
        if (!superAdmin) rememberOrganization(organizationValue);
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

        {/* Espace (association) */}
        {!superAdmin && (
          <FormField
            control={form.control}
            name="organization"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Identifiant de l’espace</FormLabel>
                <FormControl>
                  <Input
                    placeholder="mon-association"
                    autoComplete="organization"
                    autoCapitalize="none"
                    spellCheck={false}
                    disabled={isLoading}
                    aria-describedby="organization-status"
                    {...field}
                  />
                </FormControl>
                <p
                  id="organization-status"
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                  aria-live="polite"
                >
                  {organization.data ? (
                    <>
                      <Building2 className="h-4 w-4" aria-hidden="true" />
                      <span>{organization.data.name}</span>
                    </>
                  ) : (
                    'Communiqué par votre association.'
                  )}
                </p>
                <FormMessage />
              </FormItem>
            )}
          />
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
