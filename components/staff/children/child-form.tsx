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
    .max(3, 'Maximum 3 parents autorisés')
    .refine(
      (parents) => {
        const primaryCount = parents.filter((p) => p.isPrimary).length;
        return primaryCount === 1;
      },
      { message: 'Exactement un parent doit être marqué comme principal' }
    ),
  // Informations enfant
  firstName: z
    .string()
    .min(2, 'Le prénom doit contenir au moins 2 caractères')
    .max(50, 'Le prénom ne peut pas dépasser 50 caractères')
    .regex(/^[a-zA-ZÀ-\ÿ\s-]+$/, 'Caractères alphabétiques uniquement'),
  lastName: z
    .string()
    .min(2, 'Le nom doit contenir au moins 2 caractères')
    .max(50, 'Le nom ne peut pas dépasser 50 caractères')
    .regex(/^[a-zA-ZÀ-\ÿ\s-]+$/, 'Caractères alphabétiques uniquement'),
  birthDate: z.string().min(1, 'Date de naissance requise'),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER'], {
    message: 'Le genre est requis',
  }),
  ecole: z.string().max(100, 'Maximum 100 caractères'),
  // Informations médicales
  allergies: z.string(),
  medications: z.string(),
  conditions: z.string(),
  dietRestrictions: z.string(),
  medicalNotes: z.string(),
  // Contact d'urgence
  emergencyContactName: z.string().max(100).optional().or(z.literal('')),
  emergencyContactPhone: z
    .string()
    .regex(/^[\d\s\-\(\)\+]*$/, 'Format téléphone invalide (ex: 28 45 67)')
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
  basePath?: string;
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
      // Widened to `string | null` to tolerate legacy values outside the
      // canonical enum (see server/routers/children.ts B1 fix).
      relationship: string | null;
    }>;
  };
}

// ============================================================================
// COMPOSANT FORMULAIRE
// ============================================================================

export function ChildForm({ mode, initialData, basePath = '/dashboard/staff/children' }: ChildFormProps) {
  const router = useRouter();
  const utils = trpc.useUtils();

  // Mutation de création
  const createMutation = trpc.children.create.useMutation({
    onSuccess: () => {
      toast.success('Enfant créé avec succès');
      utils.children.list.invalidate();
      router.push(basePath);
      router.refresh();
    },
    onError: (error) => {
      toast.error('Erreur lors de la création', {
        description: error.message,
      });
    },
  });

  // Mutation de mise à jour
  const updateMutation = trpc.children.update.useMutation({
    onSuccess: () => {
      toast.success('Enfant modifié avec succès');
      utils.children.list.invalidate();
      if (initialData) {
        utils.children.getById.invalidate({ id: initialData.id });
      }
      router.push(basePath);
      router.refresh();
    },
    onError: (error) => {
      toast.error('Erreur lors de la modification', {
        description: error.message,
      });
    },
  });

  // Known canonical relationship enum values — used to narrow the lenient
  // `string | null` from the API back to the strict union for the form input.
  const KNOWN_RELATIONSHIPS = ['mother', 'father', 'guardian', 'step_mother', 'step_father', 'grandparent', 'other'] as const;
  type KnownRelationship = typeof KNOWN_RELATIONSHIPS[number];
  const narrowRelationship = (r: string | null | undefined): KnownRelationship | undefined => {
    if (!r) return undefined;
    return (KNOWN_RELATIONSHIPS as readonly string[]).includes(r) ? (r as KnownRelationship) : undefined;
  };

  // Préparer les valeurs par défaut
  const defaultValues: ChildFormValues = mode === 'edit' && initialData
    ? {
        parents: initialData.parents.map((p) => ({
          parentId: p.parentId,
          isPrimary: p.isPrimary,
          relationship: narrowRelationship(p.relationship),
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
      // En mode édition, on ne modifie que les infos de l'enfant
      // Les parents se gèrent via la page dédiée (Sprint 5)
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
        {/* Section Parents (seulement en mode création) */}
        {mode === 'create' && (
          <Card>
            <CardHeader>
              <CardTitle>Parents / Clients associés</CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="parents"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sélection des parents (1 à 3) *</FormLabel>
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
                      Sélectionnez entre 1 et 3 parents pour cet enfant.
                      Le parent principal sera utilisé par défaut pour la facturation et la communication.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
        )}

        {/* Section Parents (lecture seule en mode édition) */}
        {mode === 'edit' && initialData && (
          <Card>
            <CardHeader>
              <CardTitle>Parents / Clients associés</CardTitle>
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
                  <span>Pour modifier les parents associés, utilisez la page dédiée :</span>
                  <Button asChild variant="link" size="sm" className="h-auto p-0">
                    <Link href={`${basePath}/${initialData.id}/parents`}>
                      <Users className="h-4 w-4 mr-1" />
                      Gérer les parents
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
                          <SelectValue placeholder="Sélectionnez le genre" />
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

            <FormField
              control={form.control}
              name="ecole"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>École (optionnel)</FormLabel>
                  <FormControl>
                    <Input placeholder="Nom de l'école" {...field} />
                  </FormControl>
                  <FormDescription>
                    École actuellement fréquentée
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Section Informations médicales */}
        <Card>
          <CardHeader>
            <CardTitle>Informations médicales</CardTitle>
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
                    Séparez les allergies par des virgules
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
                  <FormLabel>Médicaments</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ventoline, Insuline..."
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Médicaments pris régulièrement
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
                  <FormLabel>Conditions médicales</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Asthme, Diabète, Épilepsie..."
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Conditions médicales importantes à connaître
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
                      placeholder="Végétarien, Sans gluten, Halal..."
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Régimes alimentaires spéciaux
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
                  <FormLabel>Notes médicales supplémentaires</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Informations complémentaires importantes..."
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
                    Personne à contacter en cas d'urgence
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
                    <FormLabel>Téléphone</FormLabel>
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
                    <FormLabel>Lien de parenté</FormLabel>
                    <FormControl>
                      <Input placeholder="Mère, Père, Grand-mère..." {...field} />
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
            loadingText={mode === 'create' ? 'Création...' : 'Enregistrement...'}
            className="flex-1 md:flex-initial"
          >
            <Save className="mr-2 h-4 w-4" />
            {mode === 'create' ? 'Créer l\'enfant' : 'Enregistrer les modifications'}
          </LoadingButton>

          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(basePath)}
            disabled={isPending}
          >
            Annuler
          </Button>
        </ButtonGroup>
      </form>
    </Form>
  );
}
