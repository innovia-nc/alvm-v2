'use client';

/**
 * Formulaire de création d'un membre du personnel.
 *
 * Partagé entre l'espace admin (`/dashboard/admin/users/staff/new`) et
 * l'espace staff (`/dashboard/staff/users/staff/new`) — seul `listPath`
 * (redirection après création) diffère.
 *
 * Nouveauté : génération automatique du mot de passe. Si la case
 * « Générer automatiquement » est cochée (défaut), aucun mot de passe n'est
 * saisi : le serveur en génère un robuste et le renvoie en clair UNE SEULE
 * FOIS, affiché ici dans une boîte de dialogue pour transmission au membre.
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
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { trpc } from '@/lib/trpc/client';
import { Check, Copy, Loader2 } from 'lucide-react';

const staffSchema = z
  .object({
    firstName: z.string().min(2, 'Minimum 2 caractères').max(50),
    lastName: z.string().min(2, 'Minimum 2 caractères').max(50),
    email: z.string().email('Email invalide'),
    phone: z
      .string()
      .regex(/^[\d\s\-\(\)\+]*$/, 'Format téléphone invalide')
      .optional()
      .or(z.literal('')),
    autoGeneratePassword: z.boolean(),
    password: z.string().optional().or(z.literal('')),
  })
  // Si l'admin choisit de saisir le mot de passe, il doit respecter la politique.
  .refine(
    (data) =>
      data.autoGeneratePassword ||
      (!!data.password &&
        data.password.length >= 8 &&
        /[A-Z]/.test(data.password) &&
        /[a-z]/.test(data.password) &&
        /[0-9]/.test(data.password)),
    {
      message: '8 caractères min, avec majuscule, minuscule et chiffre',
      path: ['password'],
    }
  );

type StaffFormData = z.infer<typeof staffSchema>;

type StaffCreateFormProps = {
  /** Chemin de la liste du personnel vers lequel rediriger après création. */
  listPath: string;
};

export function StaffCreateForm({ listPath }: StaffCreateFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const router = useRouter();
  const createStaffMutation = trpc.staff.create.useMutation();

  const form = useForm<StaffFormData>({
    resolver: zodResolver(staffSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      autoGeneratePassword: true,
      password: '',
    },
  });

  const autoGenerate = form.watch('autoGeneratePassword');

  async function onSubmit(values: StaffFormData) {
    try {
      setError(null);

      const result = await createStaffMutation.mutateAsync({
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        phone: values.phone,
        // Mot de passe transmis uniquement en saisie manuelle.
        password: values.autoGeneratePassword ? undefined : values.password,
      });

      // Si le serveur a généré un mot de passe, l'afficher une seule fois.
      if (result.generatedPassword) {
        setGeneratedPassword(result.generatedPassword);
        return;
      }

      router.push(listPath);
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue');
    }
  }

  function handleCloseDialog() {
    setGeneratedPassword(null);
    router.push(listPath);
    router.refresh();
  }

  async function handleCopy() {
    if (!generatedPassword) return;
    try {
      await navigator.clipboard.writeText(generatedPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Presse-papier indisponible (contexte non sécurisé) : on ignore,
      // le mot de passe reste sélectionnable manuellement.
    }
  }

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

              {/* Génération automatique du mot de passe */}
              <FormField
                control={form.control}
                name="autoGeneratePassword"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start gap-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Générer automatiquement un mot de passe</FormLabel>
                      <FormDescription>
                        Un mot de passe robuste sera créé et affiché une seule
                        fois après la création, à transmettre au membre.
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />

              {/* Saisie manuelle (uniquement si génération auto décochée) */}
              {!autoGenerate && (
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mot de passe</FormLabel>
                      <FormControl>
                        <Input type="password" {...field} />
                      </FormControl>
                      <FormDescription>
                        8 caractères min, avec majuscule, minuscule et chiffre.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

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

      {/* Affichage unique du mot de passe généré */}
      <Dialog
        open={generatedPassword !== null}
        onOpenChange={(open) => !open && handleCloseDialog()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Compte créé — mot de passe généré</DialogTitle>
            <DialogDescription>
              Communiquez ce mot de passe au membre du personnel. Il ne sera
              plus affiché après la fermeture de cette fenêtre.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2">
            <code className="flex-1 select-all rounded-md border bg-muted px-3 py-2 font-mono text-sm">
              {generatedPassword}
            </code>
            <Button type="button" variant="outline" size="icon" onClick={handleCopy}>
              {copied ? (
                <Check className="h-4 w-4 text-green-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              <span className="sr-only">Copier</span>
            </Button>
          </div>

          <DialogFooter>
            <Button type="button" onClick={handleCloseDialog}>
              J&apos;ai noté le mot de passe
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
