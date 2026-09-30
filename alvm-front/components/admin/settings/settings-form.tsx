'use client';

import { FormActions } from '@/components/shared/form-actions';
/**
 * Settings Page - Admin
 *
 * Page de configuration des paramètres système.
 * 4 sections avec formulaires fonctionnels :
 * - Organization (informations entreprise)
 * - Pricing (tarification)
 * - Email (configuration emails)
 * - Accounting (codes comptables FEC)
 */

import { PageHeader } from '@/components/shared/page-header';
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
import { ImageUpload } from '@/components/ui/image-upload';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { trpc } from '@/lib/trpc/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { Building, DollarSign, FileCode, FileText, Loader2, Mail } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

// ============================================================================
// SCHEMAS ZOD
// ============================================================================

const organizationSchema = z.object({
  name: z.string().min(1, 'Nom requis'),
  short_name: z.string().optional(),
  address: z.string().min(1, 'Adresse requise'),
  city: z.string().min(1, 'Ville requise'),
  postal_code: z.string().min(1, 'Code postal requis'),
  country: z.string().min(1, 'Pays requis'),
  phone: z.string().min(1, 'Téléphone requis'),
  email: z.string().email('Email invalide'),
  ridet: z.string().optional(),
  ape: z.string().optional(),
  legal_form: z.string().optional(),
});

const pricingSchema = z.object({
  tax_rate: z.number().min(0, 'Doit être >= 0').max(100, 'Doit être <= 100'),
  payment_terms_days: z.number().int('Doit être un entier').min(0, 'Doit être >= 0'),
  credit_expiry_days: z.number().int('Doit être un entier').min(1, 'Doit être >= 1'),
  payment_method_inactive_days: z.number().int('Doit être un entier').min(1, 'Doit être >= 1'),
});

const emailSchema = z.object({
  from_name: z.string().min(1, 'Nom expéditeur requis'),
  from_email: z.string().email('Email invalide'),
  reply_to: z.string().email('Email invalide'),
});

const accountingSchema = z.object({
  // Sert au nom du fichier FEC (SIRENFECAAAAMMJJ.txt, art. A47 A-1 du LPF).
  // Optionnel : l'export reste possible sans, avec le nom historique.
  fec_siren: z
    .string()
    .optional()
    .refine((v) => !v || /^\d{9}$/.test(v.replace(/\D/g, '')), {
      message: 'SIREN invalide (9 chiffres)',
    }),
});

const documentsSchema = z.object({
  child_form_footer: z.string(),
  invoice_footer: z.string(),
  credit_note_footer: z.string().optional(),
  attendance_footer: z.string().optional(),
  staff_profile_footer: z.string().optional(),
});

type OrganizationFormValues = z.infer<typeof organizationSchema>;
type PricingFormValues = z.infer<typeof pricingSchema>;
type EmailFormValues = z.infer<typeof emailSchema>;
type AccountingFormValues = z.infer<typeof accountingSchema>;
type DocumentsFormValues = z.infer<typeof documentsSchema>;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Transforme les settings du backend en objet pour le formulaire
 */
function settingsToFormData<T>(settings: Array<{ key: string; value: unknown }>): Partial<T> {
  return settings.reduce<Partial<T>>((acc, setting) => {
    // Parse JSON if string, otherwise use value as-is
    let parsedValue = setting.value;
    if (typeof setting.value === 'string') {
      try {
        parsedValue = JSON.parse(setting.value);
      } catch {
        parsedValue = setting.value;
      }
    }
    acc[setting.key as keyof T] = parsedValue as T[keyof T];
    return acc;
  }, {});
}

/**
 * Transforme les données du formulaire en array pour updateBulk
 */
function formDataToSettings(
  category: 'organization' | 'pricing' | 'email' | 'accounting' | 'maintenance' | 'documents',
  formData: Record<string, unknown>,
): Array<{
  category: 'organization' | 'pricing' | 'email' | 'accounting' | 'maintenance' | 'documents';
  key: string;
  value: unknown;
}> {
  return Object.entries(formData).map(([key, value]) => ({
    category,
    key,
    value,
  }));
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function SettingsForm({ global = true }: { global?: boolean }) {
  const utils = trpc.useUtils();

  // ========== FETCH SETTINGS ==========
  const { data: organizationSettings, isLoading: isLoadingOrg } =
    trpc.settings.getByCategory.useQuery({ category: 'organization' }, { enabled: global });

  const { data: pricingSettings, isLoading: isLoadingPricing } =
    trpc.settings.getByCategory.useQuery({ category: 'pricing' });

  const { data: emailSettings, isLoading: isLoadingEmail } = trpc.settings.getByCategory.useQuery(
    {
      category: 'email',
    },
    { enabled: global },
  );

  const { data: accountingSettings, isLoading: isLoadingAccounting } =
    trpc.settings.getByCategory.useQuery({ category: 'accounting' });

  const { data: documentsSettings, isLoading: isLoadingDocuments } =
    trpc.settings.getByCategory.useQuery({ category: 'documents' }, { enabled: global });

  // ========== LOGO URL ==========
  const { data: logoUrl } = trpc.settings.getLogoUrl.useQuery(undefined, { enabled: global });

  // ========== UPDATE MUTATION ==========
  const updateMutation = trpc.settings.updateBulk.useMutation({
    onSuccess: () => {
      // Invalidate all settings queries
      utils.settings.getByCategory.invalidate();
      toast.success('Paramètres mis à jour', {
        description: 'Les modifications ont été enregistrées avec succès.',
      });
    },
    onError: (error) => {
      toast.error('Erreur lors de la sauvegarde', {
        description: error.message,
      });
    },
  });

  // ========== LOGO MUTATIONS ==========
  const setLogoMutation = trpc.settings.setLogoUrl.useMutation({
    onSuccess: () => {
      utils.settings.getLogoUrl.invalidate();
      toast.success('Logo enregistré', {
        description: 'Le logo a été uploadé avec succès.',
      });
    },
    onError: (error) => {
      toast.error('Erreur lors de la sauvegarde du logo', {
        description: error.message,
      });
    },
  });

  const deleteLogoMutation = trpc.settings.deleteLogoUrl.useMutation({
    onSuccess: () => {
      utils.settings.getLogoUrl.invalidate();
      toast.success('Logo supprimé', {
        description: 'Le logo a été supprimé avec succès.',
      });
    },
    onError: (error) => {
      toast.error('Erreur lors de la suppression du logo', {
        description: error.message,
      });
    },
  });

  // ========== FORMS ==========
  const organizationForm = useForm<OrganizationFormValues>({
    resolver: zodResolver(organizationSchema),
    defaultValues: {
      name: '',
      short_name: '',
      address: '',
      city: '',
      postal_code: '',
      country: '',
      phone: '',
      email: '',
      ridet: '',
      ape: '',
      legal_form: '',
    },
    mode: 'onBlur',
  });

  const pricingForm = useForm<PricingFormValues>({
    resolver: zodResolver(pricingSchema),
    defaultValues: {
      tax_rate: 0,
      payment_terms_days: 30,
      credit_expiry_days: 365,
      payment_method_inactive_days: 30,
    },
    mode: 'onBlur',
  });

  const emailForm = useForm<EmailFormValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: {
      from_name: '',
      from_email: '',
      reply_to: '',
    },
    mode: 'onBlur',
  });

  const accountingForm = useForm<AccountingFormValues>({
    resolver: zodResolver(accountingSchema),
    defaultValues: {
      fec_siren: '',
    },
    mode: 'onBlur',
  });

  const documentsForm = useForm<DocumentsFormValues>({
    resolver: zodResolver(documentsSchema),
    defaultValues: {
      child_form_footer: 'Document à conserver',
      invoice_footer: 'Facture à régler dans les 30 jours',
      credit_note_footer: '',
      attendance_footer: '',
      staff_profile_footer: '',
    },
    mode: 'onBlur',
  });

  // ========== POPULATE FORMS WHEN DATA LOADS ==========
  // Les reset() mergent les valeurs BDD au-dessus des défauts pour ne pas
  // afficher de champs vides quand une clé n'a pas encore été persistée.
  useEffect(() => {
    if (organizationSettings) {
      const data = settingsToFormData<OrganizationFormValues>(organizationSettings);
      organizationForm.reset({
        name: '',
        short_name: '',
        address: '',
        city: '',
        postal_code: '',
        country: '',
        phone: '',
        email: '',
        ridet: '',
        ape: '',
        legal_form: '',
        ...data,
      });
    }
  }, [organizationSettings, organizationForm]);

  useEffect(() => {
    if (pricingSettings) {
      const data = settingsToFormData<PricingFormValues>(pricingSettings);
      pricingForm.reset({
        tax_rate: 0,
        payment_terms_days: 30,
        credit_expiry_days: 365,
        payment_method_inactive_days: 30,
        ...data,
      });
    }
  }, [pricingSettings, pricingForm]);

  useEffect(() => {
    if (emailSettings) {
      const data = settingsToFormData<EmailFormValues>(emailSettings);
      emailForm.reset({
        from_name: '',
        from_email: '',
        reply_to: '',
        ...data,
      });
    }
  }, [emailSettings, emailForm]);

  useEffect(() => {
    if (accountingSettings) {
      const data = settingsToFormData<AccountingFormValues>(accountingSettings);
      accountingForm.reset({
        fec_siren: '',
        ...data,
      });
    }
  }, [accountingSettings, accountingForm]);

  useEffect(() => {
    if (documentsSettings) {
      const data = settingsToFormData<DocumentsFormValues>(documentsSettings);
      documentsForm.reset({
        child_form_footer: 'Document à conserver',
        invoice_footer: 'Facture à régler dans les 30 jours',
        credit_note_footer: '',
        attendance_footer: '',
        staff_profile_footer: '',
        ...data,
      });
    }
  }, [documentsSettings, documentsForm]);

  // ========== SUBMIT HANDLERS ==========
  const onSubmitOrganization = (values: OrganizationFormValues) => {
    const settings = formDataToSettings('organization', values);
    updateMutation.mutate({ settings });
  };

  const onSubmitPricing = (values: PricingFormValues) => {
    const settings = formDataToSettings('pricing', values);
    updateMutation.mutate({ settings });
  };

  const onSubmitEmail = (values: EmailFormValues) => {
    const settings = formDataToSettings('email', values);
    updateMutation.mutate({ settings });
  };

  const onSubmitAccounting = (values: AccountingFormValues) => {
    const settings = formDataToSettings('accounting', values);
    updateMutation.mutate({ settings });
  };

  const onSubmitDocuments = (values: DocumentsFormValues) => {
    const settings = formDataToSettings('documents', values);
    updateMutation.mutate({ settings });
  };

  // ========== LOGO HANDLERS ==========
  const handleLogoUpload = async (url: string) => {
    // Enregistrer l'URL dans les settings
    await setLogoMutation.mutateAsync({ url });
  };

  const handleLogoRemove = async () => {
    if (!logoUrl) return;

    try {
      // 1. Supprimer le blob sur Vercel
      await fetch('/api/upload/logo', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: logoUrl }),
      });

      // 2. Supprimer l'URL des settings
      await deleteLogoMutation.mutateAsync();
    } catch {
      toast.error('Erreur lors de la suppression', {
        description: 'Impossible de supprimer le logo.',
      });
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={global ? 'Configuration de l’entreprise' : 'Paramètres métier'}
        description={
          global
            ? 'Configurez les paramètres de votre association'
            : 'Tarification et comptabilité. Les paramètres globaux sont gérés par le super admin.'
        }
      />

      {/* ========== ORGANIZATION ========== */}
      {global && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building className="h-5 w-5" />
              <CardTitle>Informations de l&apos;Organisation</CardTitle>
            </div>
            <CardDescription>
              Informations affichées sur les factures et documents officiels
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingOrg ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <Form {...organizationForm}>
                <form
                  onSubmit={organizationForm.handleSubmit(onSubmitOrganization)}
                  className="space-y-6"
                >
                  {/* Logo Upload Section */}
                  <div className="rounded-lg border border-border bg-muted/50 p-4">
                    <div className="mb-3">
                      <h3 className="text-sm font-medium text-foreground">
                        Logo de l&apos;organisation
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Logo affiché sur les factures et documents officiels
                      </p>
                    </div>
                    <ImageUpload
                      value={logoUrl}
                      onUpload={handleLogoUpload}
                      onRemove={handleLogoRemove}
                      isLoading={setLogoMutation.isPending || deleteLogoMutation.isPending}
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={organizationForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required>Nom de l&apos;organisation</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="Renseignez votre nom d'organisation"
                              disabled={updateMutation.isPending}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={organizationForm.control}
                      name="short_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nom court</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value || ''}
                              placeholder="Ex : Mon association"
                              disabled={updateMutation.isPending}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={organizationForm.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel required>Adresse</FormLabel>
                        <FormControl>
                          <Input {...field} disabled={updateMutation.isPending} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid gap-4 md:grid-cols-3">
                    <FormField
                      control={organizationForm.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required>Ville</FormLabel>
                          <FormControl>
                            <Input {...field} disabled={updateMutation.isPending} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={organizationForm.control}
                      name="postal_code"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required>Code postal</FormLabel>
                          <FormControl>
                            <Input {...field} disabled={updateMutation.isPending} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={organizationForm.control}
                      name="country"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required>Pays</FormLabel>
                          <FormControl>
                            <Input {...field} disabled={updateMutation.isPending} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={organizationForm.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required>Téléphone</FormLabel>
                          <FormControl>
                            <Input {...field} type="tel" disabled={updateMutation.isPending} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={organizationForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel required>Email</FormLabel>
                          <FormControl>
                            <Input {...field} type="email" disabled={updateMutation.isPending} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <FormField
                      control={organizationForm.control}
                      name="ridet"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>RIDET</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value || ''}
                              placeholder="ex: 1234567.001"
                              disabled={updateMutation.isPending}
                            />
                          </FormControl>
                          <FormDescription>
                            Identifiant légal NC (optionnel mais recommandé)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={organizationForm.control}
                      name="ape"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Code APE</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value || ''}
                              placeholder="ex: 9329Z"
                              disabled={updateMutation.isPending}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={organizationForm.control}
                      name="legal_form"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Forme juridique</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              value={field.value || ''}
                              placeholder="ex: Association loi 1901"
                              disabled={updateMutation.isPending}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormActions>
                    <Button type="submit" disabled={updateMutation.isPending}>
                      {updateMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Enregistrer les modifications
                    </Button>
                  </FormActions>
                </form>
              </Form>
            )}
          </CardContent>
        </Card>
      )}

      {/* ========== PRICING ========== */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            <CardTitle>Paramètres de Tarification</CardTitle>
          </div>
          <CardDescription>Configuration des tarifs et de la devise</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingPricing ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <Form {...pricingForm}>
              <form onSubmit={pricingForm.handleSubmit(onSubmitPricing)} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Devise</p>
                    <Input value="XPF" disabled aria-label="Devise" />
                    <p className="text-sm text-muted-foreground">
                      Tous les montants de cette application sont exprimés en XPF.
                    </p>
                  </div>

                  <FormField
                    control={pricingForm.control}
                    name="tax_rate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel required>Taux de taxe (%)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                            disabled={updateMutation.isPending}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={pricingForm.control}
                  name="payment_terms_days"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>Délai de paiement (jours)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                          disabled={updateMutation.isPending}
                        />
                      </FormControl>
                      <FormDescription>
                        Nombre de jours accordés pour le paiement des factures
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={pricingForm.control}
                    name="credit_expiry_days"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel required>Validité des avoirs (jours)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                            disabled={updateMutation.isPending}
                          />
                        </FormControl>
                        <FormDescription>
                          Durée de validité des avoirs et crédits parents
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={pricingForm.control}
                    name="payment_method_inactive_days"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel required>Inactivité moyens de paiement (jours)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                            disabled={updateMutation.isPending}
                          />
                        </FormControl>
                        <FormDescription>
                          Délai sous lequel un moyen de paiement ne peut pas être désactivé
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormActions>
                  <Button type="submit" disabled={updateMutation.isPending}>
                    {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Enregistrer les modifications
                  </Button>
                </FormActions>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>

      {/* ========== EMAIL ========== */}
      {global && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              <CardTitle>Configuration Email</CardTitle>
            </div>
            <CardDescription>
              Paramètres pour l&apos;envoi d&apos;emails transactionnels
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-blue-200 bg-blue-50 p-4 mb-4">
              <p className="text-sm text-blue-900">
                <strong>Service configuré :</strong> Resend
              </p>
              <p className="mt-1 text-xs text-blue-700">
                Les emails sont envoyés via le service Resend. La configuration SMTP se fait dans
                les variables d&apos;environnement.
              </p>
            </div>

            {isLoadingEmail ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <Form {...emailForm}>
                <form onSubmit={emailForm.handleSubmit(onSubmitEmail)} className="space-y-4">
                  <FormField
                    control={emailForm.control}
                    name="from_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel required>Nom de l&apos;expéditeur</FormLabel>
                        <FormControl>
                          <Input {...field} disabled={updateMutation.isPending} />
                        </FormControl>
                        <FormDescription>Nom affiché dans les emails envoyés</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={emailForm.control}
                    name="from_email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel required>Email expéditeur</FormLabel>
                        <FormControl>
                          <Input {...field} type="email" disabled={updateMutation.isPending} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={emailForm.control}
                    name="reply_to"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel required>Email de réponse</FormLabel>
                        <FormControl>
                          <Input {...field} type="email" disabled={updateMutation.isPending} />
                        </FormControl>
                        <FormDescription>
                          Email utilisé quand les destinataires répondent
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormActions>
                    <Button type="submit" disabled={updateMutation.isPending}>
                      {updateMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Enregistrer les modifications
                    </Button>
                  </FormActions>
                </form>
              </Form>
            )}
          </CardContent>
        </Card>
      )}

      {/* ========== ACCOUNTING ========== */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            <CardTitle>Export Comptable FEC</CardTitle>
          </div>
          <CardDescription>
            Configuration pour l&apos;export du Fichier des Écritures Comptables
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingAccounting ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <Form {...accountingForm}>
              <form
                onSubmit={accountingForm.handleSubmit(onSubmitAccounting)}
                className="space-y-4"
              >
                <p className="text-sm text-muted-foreground">
                  Journal ventes : VE. Compte clients : 411000. Les comptes de produits sont définis
                  par type d’ACM (706000 par défaut).
                </p>

                <FormField
                  control={accountingForm.control}
                  name="fec_siren"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>SIREN</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value || ''}
                          placeholder="ex: 123456789"
                          className="font-mono"
                          disabled={updateMutation.isPending}
                        />
                      </FormControl>
                      <FormDescription>
                        9 chiffres. Nomme le fichier d&apos;export (SIRENFECAAAAMMJJ.txt, article
                        A47 A-1 du LPF). Sans SIREN, l&apos;export garde son nom historique.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormActions>
                  <Button type="submit" disabled={updateMutation.isPending}>
                    {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Enregistrer les modifications
                  </Button>
                </FormActions>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>

      {/* ========== DOCUMENTS ========== */}
      {global && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileCode className="h-5 w-5" />
              <CardTitle>Mentions Documents</CardTitle>
            </div>
            <CardDescription>
              Configuration des mentions obligatoires pour les documents générés
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingDocuments ? (
              <div className="space-y-4">
                <Skeleton className="h-32 w-full" />
              </div>
            ) : (
              <Form {...documentsForm}>
                <form
                  onSubmit={documentsForm.handleSubmit(onSubmitDocuments)}
                  className="space-y-4"
                >
                  <FormField
                    control={documentsForm.control}
                    name="child_form_footer"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mention de bas de page (Fiche enfant PDF)</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            rows={4}
                            placeholder="Ex: Ce document contient des informations confidentielles..."
                            disabled={updateMutation.isPending}
                          />
                        </FormControl>
                        <FormDescription>
                          Cette mention apparaîtra en bas de chaque fiche enfant générée en PDF.
                          Vous pouvez y inclure des mentions légales, RGPD, etc.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={documentsForm.control}
                    name="invoice_footer"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mention de bas de page (Facture PDF)</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            rows={4}
                            placeholder="Ex: Merci de votre confiance ! Paiement par chèque ou virement..."
                            disabled={updateMutation.isPending}
                          />
                        </FormControl>
                        <FormDescription>
                          Cette mention apparaîtra en bas de chaque facture générée en PDF. Vous
                          pouvez y inclure les modalités de paiement, mentions légales, etc.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={documentsForm.control}
                    name="credit_note_footer"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mention de bas de page (Avoir PDF)</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            value={field.value || ''}
                            rows={3}
                            placeholder="Ex: Cet avoir sera déduit du solde de votre compte."
                            disabled={updateMutation.isPending}
                          />
                        </FormControl>
                        <FormDescription>
                          Cette mention apparaîtra en bas de chaque avoir PDF.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={documentsForm.control}
                    name="attendance_footer"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mention de bas de page (Liste de présence PDF)</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            value={field.value || ''}
                            rows={3}
                            placeholder="Ex: Document interne — à conserver dans le dossier ACM."
                            disabled={updateMutation.isPending}
                          />
                        </FormControl>
                        <FormDescription>
                          Cette mention apparaîtra en bas de chaque liste de présence PDF.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={documentsForm.control}
                    name="staff_profile_footer"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mention de bas de page (Fiche personnel PDF)</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            value={field.value || ''}
                            rows={3}
                            placeholder="Ex: Document confidentiel — usage strictement interne."
                            disabled={updateMutation.isPending}
                          />
                        </FormControl>
                        <FormDescription>
                          Cette mention apparaîtra en bas de chaque fiche personnel PDF.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormActions>
                    <Button type="submit" disabled={updateMutation.isPending}>
                      {updateMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Enregistrer les modifications
                    </Button>
                  </FormActions>
                </form>
              </Form>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
