'use client';

/**
 * Formulaire de création d'un membre du personnel.
 *
 * Partagé entre l'espace admin (`/dashboard/admin/users/staff/new`) et
 * l'espace staff (`/dashboard/staff/users/staff/new`) — seul `listPath`
 * (redirection après création) diffère.
 *
 * US-PERS-01 — génération automatique de mot de passe :
 *  - un bouton « Générer un mot de passe » remplit le champ dédié ;
 *  - le mot de passe généré est affiché EN CLAIR (pas masqué) pour permettre
 *    la vérification et la copie ;
 *  - un bouton « Copier » avec retour visuel (« Copié ! ») est disponible ;
 *  - à la soumission, une modale BLOQUANTE rappelle que le mot de passe ne
 *    sera plus affiché après la création, et exige une confirmation explicite.
 *
 * La génération se fait côté navigateur (`lib/password.ts`, Web Crypto). Le
 * serveur revalide la politique et reste capable d'en générer un lui-même si
 * le champ arrive vide.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { trpc } from '@/lib/trpc/client';
import { generatePassword } from '@/lib/password';
import { PASSWORD_MIN_LENGTH } from '@/lib/password-policy';
import { Copy, KeyRound, Loader2 } from 'lucide-react';

const staffSchema = z.object({
  firstName: z.string().min(2, 'Minimum 2 caractères').max(50),
  lastName: z.string().min(2, 'Minimum 2 caractères').max(50),
  email: z.string().email('Email invalide'),
  phone: z
    .string()
    .regex(/^[\d\s\-\(\)\+]*$/, 'Format téléphone invalide')
    .optional()
    .or(z.literal('')),
  // Politique de saisie manuelle (inchangée) : 8 caractères, 3 classes.
  // Un mot de passe généré (16 caractères, 4 classes) la satisfait largement.
  password: z
    .string()
    .min(8, '8 caractères minimum')
    .regex(/[A-Z]/, 'Au moins une majuscule')
    .regex(/[a-z]/, 'Au moins une minuscule')
    .regex(/[0-9]/, 'Au moins un chiffre'),
});

type StaffFormData = z.infer<typeof staffSchema>;

type StaffCreateFormProps = {
  /** Chemin de la liste du personnel vers lequel rediriger après création. */
  listPath: string;
};

export function StaffCreateForm({ listPath }: StaffCreateFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Valeurs mises en attente pendant que la modale d'avertissement est ouverte.
  const [pendingValues, setPendingValues] = useState<StaffFormData | null>(null);
  const router = useRouter();
  const createStaffMutation = trpc.staff.create.useMutation();

  const form = useForm<StaffFormData>({
    resolver: zodResolver(staffSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      password: '',
    },
  });

  function handleGeneratePassword() {
    form.setValue('password', generatePassword(), {
      shouldValidate: true,
      shouldDirty: true,
    });
    setCopied(false);
  }

  async function handleCopy() {
    const password = form.getValues('password');
    if (!password) return;

    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Presse-papier indisponible (contexte non sécurisé) : le mot de passe
      // reste affiché en clair et sélectionnable à la main.
      setError(
        'Copie automatique indisponible. Sélectionnez le mot de passe pour le copier manuellement.'
      );
    }
  }

  /**
   * Soumission : on n'écrit rien tant que l'administrateur n'a pas confirmé
   * avoir noté le mot de passe. La modale est bloquante par construction — la
   * création n'a lieu que dans `confirmCreate`.
   */
  function onSubmit(values: StaffFormData) {
    setError(null);
    setPendingValues(values);
  }

  async function confirmCreate() {
    if (!pendingValues) return;

    try {
      setError(null);
      await createStaffMutation.mutateAsync({
        firstName: pendingValues.firstName,
        lastName: pendingValues.lastName,
        email: pendingValues.email,
        phone: pendingValues.phone,
        password: pendingValues.password,
      });

      setPendingValues(null);
      router.push(listPath);
      router.refresh();
    } catch (err) {
      setPendingValues(null);
      setError(err instanceof Error && err.message ? err.message : 'Une erreur est survenue');
    }
  }

  const password = form.watch('password');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ajouter un membre du personnel"
        description="Créer un nouveau compte staff"
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Informations du membre</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Prénom</FormLabel>
                      <FormControl>
                        <Input {...field} />
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
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Téléphone (optionnel)</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
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
                    <div className="flex items-center gap-2">
                      <FormControl>
                        {/* Volontairement `type="text"` : le mot de passe doit
                            rester lisible pour être vérifié puis recopié. */}
                        <Input type="text" autoComplete="off" spellCheck={false} {...field} />
                      </FormControl>

                      <TooltipProvider>
                        <Tooltip open={copied || undefined}>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={handleCopy}
                              disabled={!password}
                              aria-label="Copier le mot de passe"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>{copied ? 'Copié !' : 'Copier'}</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>

                    <Button
                      type="button"
                      variant="secondary"
                      className="mt-2"
                      onClick={handleGeneratePassword}
                    >
                      <KeyRound className="mr-2 h-4 w-4" />
                      Générer un mot de passe
                    </Button>

                    <FormDescription>
                      {PASSWORD_MIN_LENGTH} caractères minimum pour un mot de passe
                      généré (majuscules, minuscules, chiffres et caractère spécial,
                      sans caractère ambigu). Saisie manuelle : 8 caractères minimum
                      avec majuscule, minuscule et chiffre.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex gap-4">
                <Button type="submit" disabled={createStaffMutation.isPending}>
                  {createStaffMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Créer le compte
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                  disabled={createStaffMutation.isPending}
                >
                  Annuler
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Avertissement bloquant : le mot de passe n'est plus récupérable après
          création (seul son hash bcrypt est conservé). */}
      <AlertDialog
        open={pendingValues !== null}
        onOpenChange={(open) => {
          if (!open && !createStaffMutation.isPending) setPendingValues(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Avez-vous noté le mot de passe ?</AlertDialogTitle>
            <AlertDialogDescription>
              Ce mot de passe ne sera plus affiché après la création du compte.
              Merci de le copier ou de le noter avant de continuer. Aucune
              récupération ultérieure n&apos;est possible : il faudrait alors
              réinitialiser le mot de passe du membre.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex items-center gap-2">
            <code className="flex-1 select-all break-all rounded-md border bg-muted px-3 py-2 font-mono text-sm">
              {pendingValues?.password}
            </code>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleCopy}
              aria-label="Copier le mot de passe"
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          {copied && (
            <p className="text-sm text-muted-foreground" role="status">
              Copié !
            </p>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={createStaffMutation.isPending}>
              Revenir au formulaire
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                // On garde la modale ouverte le temps de la mutation : la
                // fermer avant la réponse ferait disparaître le mot de passe.
                event.preventDefault();
                void confirmCreate();
              }}
              disabled={createStaffMutation.isPending}
            >
              {createStaffMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              J&apos;ai noté le mot de passe, créer le compte
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
