'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import * as z from 'zod';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LoadingButton } from '@/components/ui/loading-button';
import { ButtonGroup } from '@/components/ui/button-group';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc/client';
import { Save, Users, Info } from 'lucide-react';
import { ParentMultiSelect } from '@/components/shared/parent-multi-select';
import type { SelectedParent } from '@/components/shared/selected-parents-list';
import Link from 'next/link';

// ============================================================================
// SCHEMAS DE VALIDATION
// ============================================================================

/**
 * Schema de formulaire enfant avec parents multiples
 * Conforme au nouveau schema tRPC children.create/update
 */
const childFormSchema = z.object({
  // Parents multiples (min 1, max 3, exactement 1 principal)
  parents: z
    .array(
      z.object({
        parentId: z.string().uuid(),
        isPrimary: z.boolean(),
        relationship: z
          .enum(['mother', 'father', 'guardian', 'step_mother', 'step_father', 'grandparent', 'other'])
          .optional(),
      })
    )
    .min(1, 'Au moins un parent est requis')
    .max(3, 'Maximum 3 parents autoris\u00e9s')
    .refine(
      (parents) => {
        const primaryCount = parents.filter((p) => p.isPrimary).length;
        return primaryCount === 1;
      },
      { message: 'Exactement un parent doit \u00eatre marqu\u00e9 comme principal' }
    ),
  // Informations enfant
  firstName: z
    .string()
    .min(2, 'Le pr\u00e9nom doit contenir au moins 2 caract\u00e8res')
    .max(50, 'Le pr\u00e9nom ne peut pas d\u00e9passer 50 caract\u00e8res')
    .regex(/^[a-zA-Z\u00C0-\u00FF\s-]+$/, 'Caract\u00e8res alphab\u00e9tiques uniquement'),
  lastName: z
    .string()
    .min(2, 'Le nom doit contenir au moins 2 caract\u00e8res')
    .max(50, 'Le nom ne peut pas d\u00e9passer 50 caract\u00e8res')
    .regex(/^[a-zA-Z\u00C0-\u00FF\s-]+$/, 'Caract\u00e8res alphab\u00e9tiques uniquement'),
  birthDate: z.string().min(1, 'Date de naissance requise'),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER'], {
    message: 'Le genre est requis',
  }),
  ecole: z.string().max(100, 'Maximum 100 caract\u00e8res'),
  // Informations m\u00e9dicales
  allergies: z.string(),
  medications: z.string(),
  conditions: z.string(),
  dietRestrictions: z.string(),
  medicalNotes: z.string(),
  // Contact d'urgence
  emergencyContactName: z.string().max(100).optional().or(z.literal('')),
  emergencyContactPhone: z
    .string()
    .regex(/^[\d\s\-\(\)\+]*$/, 'Format t\u00e9l\u00e9phone invalide (ex: 28 45 67)')
    .optional()
    .or(z.literal('')),
  emergencyContactRelation: z.string().optional().or(z.literal('')),
});

type ChildFormValues = z.infer<typeof childFormSchema>;

// ============================================================================
// TYPES
// ============================================================================

interface ChildFormProps {
  mode: 'create' | 'edit';
  initialData?: {
    id: string;
    firstName: string;
    lastName: string;
    birthDate: Date;
    gender: 'MALE' | 'FEMALE' | 'OTHER';
    ecole: string | null;
    medicalInfo: {
      allergies: string[];
      medications: string[];
      conditions: string[];
      diet_restrictions: string[];
      notes: string;
    };
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
    emergencyContactRelation: string | null;
    parents: Array<{
      id: string;
      parentId: string;
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
      isPrimary: boolean;
      relationship: 'mother' | 'father' | 'guardian' | 'step_mother' | 'step_father' | 'grandparent' | 'other' | null;
    }>;
  };
}

// ============================================================================
// COMPOSANT FORMULAIRE
// ============================================================================

export function ChildForm({ mode, initialData }: ChildFormProps) {
  const router = useRouter();
  const utils = trpc.useUtils();

  // Mutation de cr\u00e9ation
  const createMutation = trpc.children.create.useMutation({
    onSuccess: () => {
      toast.success('Enfant cr\u00e9\u00e9 avec succ\u00e8s');
      utils.children.list.invalidate();
      router.push('/dashboard/staff/children');
      router.refresh();
    },
    onError: (error) => {
      toast.error('Erreur lors de la cr\u00e9ation', {
        description: error.message,
      });
    },
  });

  // Mutation de mise \u00e0 jour
  const updateMutation = trpc.children.update.useMutation({
    onSuccess: () => {
      toast.success('Enfant modifi\u00e9 avec succ\u00e8s');
      utils.children.list.invalidate();
      if (initialData) {
        utils.children.getById.invalidate({ id: initialData.id });
      }
      router.push('/dashboard/staff/children');
      router.refresh();
    },
    onError: (error) => {
      toast.error('Erreur lors de la modification', {
        description: error.message,
      });
    },
  });

  // Pr\u00e9parer les valeurs par d\u00e9faut
  const defaultValues: ChildFormValues = mode === 'edit' && initialData
    ? {
        parents: initialData.parents.map((p) => ({
          parentId: p.parentId,
          isPrimary: p.isPrimary,
          relationship: p.relationship || undefined,
        })),
        firstName: initialData.firstName,
        lastName: initialData.lastName,
        birthDate: new Date(initialData.birthDate).toISOString().split('T')[0]!,
        gender: initialData.gender,
        ecole: initialData.ecole || '',
        allergies: initialData.medicalInfo?.allergies?.join(', ') || '',
        medications: initialData.medicalInfo?.medications?.join(', ') || '',
        conditions: initialData.medicalInfo?.conditions?.join(', ') || '',
        dietRestrictions: initialData.medicalInfo?.diet_restrictions?.join(', ') || '',
        medicalNotes: initialData.medicalInfo?.notes || '',
        emergencyContactName: initialData.emergencyContactName || '',
        emergencyContactPhone: initialData.emergencyContactPhone || '',
        emergencyContactRelation: initialData.emergencyContactRelation || '',
      }
    : {
        parents: [],
        firstName: '',
        lastName: '',
        birthDate: '',
        gender: 'MALE',
        ecole: '',
        allergies: '',
        medications: '',
        conditions: '',
        dietRestrictions: '',
        medicalNotes: '',
        emergencyContactName: '',
        emergencyContactPhone: '',
        emergencyContactRelation: '',
      };

  // Configuration React Hook Form
  const form = useForm<ChildFormValues>({
    resolver: zodResolver(childFormSchema),
    defaultValues,
    mode: 'onBlur',
  });

  // Soumission du formulaire
  async function onSubmit(values: ChildFormValues) {
    // Transformer les champs texte en arrays pour medicalInfo
    const medicalInfo = {
      allergies: values.allergies
        ? values.allergies.split(',').map(s => s.trim()).filter(Boolean)
        : [],
      medications: values.medications
        ? values.medications.split(',').map(s => s.trim()).filter(Boolean)
        : [],
      conditions: values.conditions
        ? values.conditions.split(',').map(s => s.trim()).filter(Boolean)
        : [],
      diet_restrictions: values.dietRestrictions
        ? values.dietRestrictions.split(',').map(s => s.trim()).filter(Boolean)
        : [],
      notes: values.medicalNotes || '',
    };

    // Convertir la date au format ISO datetime
    const birthDateISO = new Date(values.birthDate).toISOString();

    if (mode === 'create') {
      await createMutation.mutateAsync({
        firstName: values.firstName,
        lastName: values.lastName,
        birthDate: birthDateISO,
        gender: values.gender,
        ecole: values.ecole || undefined,
        medicalInfo,
        emergencyContactName: values.emergencyContactName || undefined,
        emergencyContactPhone: values.emergencyContactPhone || undefined,
        emergencyContactRelation: values.emergencyContactRelation || undefined,
        parents: values.parents,
      });
    } else if (initialData) {
      // En mode \u00e9dition, on ne modifie que les infos de l'enfant
      // Les parents se g\u00e8rent via la page d\u00e9di\u00e9e (Sprint 5)
      await updateMutation.mutateAsync({
        id: initialData.id,
        firstName: values.firstName,
        lastName: values.lastName,
        birthDate: birthDateISO,
        gender: values.gender,
        ecole: values.ecole || undefined,
        medicalInfo,
        emergencyContactName: values.emergencyContactName || undefined,
        emergencyContactPhone: values.emergencyContactPhone || undefined,
        emergencyContactRelation: values.emergencyContactRelation || undefined,
      });
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  // Convertir les parents pour le ParentMultiSelect
  const selectedParents: SelectedParent[] = mode === 'edit' && initialData
    ? initialData.parents.map((p) => ({
        id: p.id,
        parentId: p.parentId,
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email,
        phone: p.phone,
        isPrimary: p.isPrimary,
        relationship: p.relationship,
      }))
    : [];

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        {/* Section Parents (seulement en mode cr\u00e9ation) */}
        {mode === 'create' && (
          <Card>
            <CardHeader>
              <CardTitle>Parents associ\u00e9s</CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="parents"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>S\u00e9lection des parents (1 \u00e0 3) *</FormLabel>
                    <FormControl>
                      <ParentMultiSelect
                        value={field.value.map((p) => ({
                          id: '',
                          parentId: p.parentId,
                          firstName: '',
                          lastName: '',
                          email: '',
                          phone: '',
                          isPrimary: p.isPrimary,
                          relationship: p.relationship || null,
                        }))}
                        onChange={(parents) => {
                          field.onChange(
                            parents.map((p) => ({
                              parentId: p.parentId,
                              isPrimary: p.isPrimary,
                              relationship: p.relationship || undefined,
                            }))
                          );
                        }}
                        maxParents={3}
                        disabled={isPending}
                      />
                    </FormControl>
                    <FormDescription>
                      S\u00e9lectionnez entre 1 et 3 parents pour cet enfant.
                      Le parent principal sera utilis\u00e9 par d\u00e9faut pour la facturation et la communication.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
        )}

        {/* Section Parents (lecture seule en mode \u00e9dition) */}
        {mode === 'edit' && initialData && (
          <Card>
            <CardHeader>
              <CardTitle>Parents associ\u00e9s</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {selectedParents.map((parent) => (
                  <div
                    key={parent.parentId}
                    className="rounded-lg border p-3 bg-muted/50"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">
                          {parent.firstName} {parent.lastName}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {parent.email}
                        </div>
                      </div>
                      {parent.isPrimary && (
                        <span className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded">
                          Principal
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <Alert className="mt-4">
                <Info className="h-4 w-4" />
                <AlertDescription className="flex items-center gap-2">
                  <span>Pour modifier les parents associ\u00e9s, utilisez la page d\u00e9di\u00e9e :</span>
                  <Button asChild variant="link" size="sm" className="h-auto p-0">
                    <Link href={`/dashboard/staff/children/${initialData.id}/parents`}>
                      <Users className="h-4 w-4 mr-1" />
                      G\u00e9rer les parents
                    </Link>
                  </Button>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        )}

        {/* Section Informations personnelles */}
        <Card>
          <CardHeader>
            <CardTitle>Informations personnelles</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pr\u00e9nom *</FormLabel>
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

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="birthDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date de naissance *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormDescription>
                      Format : JJ/MM/AAAA
                    </FormDescription>
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
                          <SelectValue placeholder="S\u00e9lectionnez le genre" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="MALE">Gar\u00e7on</SelectItem>
                        <SelectItem value="FEMALE">Fille</SelectItem>
                        <SelectItem value="OTHER">Autre</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="ecole"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>\u00c9cole (optionnel)</FormLabel>
                  <FormControl>
                    <Input placeholder="Nom de l'\u00e9cole" {...field} />
                  </FormControl>
                  <FormDescription>
                    \u00c9cole actuellement fr\u00e9quent\u00e9e
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Section Informations m\u00e9dicales */}
        <Card>
          <CardHeader>
            <CardTitle>Informations m\u00e9dicales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="allergies"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Allergies</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Arachides, Lactose, Pollen..."
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    S\u00e9parez les allergies par des virgules
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="medications"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>M\u00e9dicaments</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ventoline, Insuline..."
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    M\u00e9dicaments pris r\u00e9guli\u00e8rement
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="conditions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Conditions m\u00e9dicales</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Asthme, Diab\u00e8te, \u00c9pilepsie..."
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Conditions m\u00e9dicales importantes \u00e0 conna\u00eetre
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="dietRestrictions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Restrictions alimentaires</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="V\u00e9g\u00e9tarien, Sans gluten, Halal..."
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    R\u00e9gimes alimentaires sp\u00e9ciaux
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="medicalNotes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes m\u00e9dicales suppl\u00e9mentaires</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Informations compl\u00e9mentaires importantes..."
                      className="min-h-[100px]"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Section Contact d'urgence */}
        <Card>
          <CardHeader>
            <CardTitle>Contact d'urgence</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="emergencyContactName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nom du contact</FormLabel>
                  <FormControl>
                    <Input placeholder="Marie Dupont" {...field} />
                  </FormControl>
                  <FormDescription>
                    Personne \u00e0 contacter en cas d'urgence
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="emergencyContactPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>T\u00e9l\u00e9phone</FormLabel>
                    <FormControl>
                      <Input placeholder="28 45 67" {...field} />
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
                    <FormLabel>Lien de parent\u00e9</FormLabel>
                    <FormControl>
                      <Input placeholder="M\u00e8re, P\u00e8re, Grand-m\u00e8re..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* Boutons d'action */}
        <ButtonGroup align="right" responsive>
          <LoadingButton
            type="submit"
            loading={isPending}
            loadingText={mode === 'create' ? 'Cr\u00e9ation...' : 'Enregistrement...'}
            className="flex-1 md:flex-initial"
          >
            <Save className="mr-2 h-4 w-4" />
            {mode === 'create' ? 'Cr\u00e9er l\'enfant' : 'Enregistrer les modifications'}
          </LoadingButton>

          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/dashboard/staff/children')}
            disabled={isPending}
          >
            Annuler
          </Button>
        </ButtonGroup>
      </form>
    </Form>
  );
}
