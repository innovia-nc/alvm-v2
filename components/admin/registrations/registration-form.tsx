'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@/server/trpc/router';
import { trpc } from '@/lib/trpc/client';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Check, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useDashboardBasePath } from '@/lib/hooks/use-dashboard-base-path';

const registrationFormSchema = z.object({
  parentId: z.string().uuid('Sélectionnez un parent'),
  campId: z.string().uuid('Sélectionnez un camp'),
  childId: z.string().uuid('Sélectionnez un enfant'),
  specialRequirements: z.string().optional(),
  status: z.enum(['PENDING', 'CONFIRMED', 'WAITLIST']),
});

type RegistrationFormValues = z.infer<typeof registrationFormSchema>;

type CampListItem =
  inferRouterOutputs<AppRouter>['camps']['list']['camps'][number];

export function RegistrationForm() {
  const router = useRouter();
  const basePath = useDashboardBasePath();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedCamp, setSelectedCamp] = useState<CampListItem | null>(null);
  const [childSearch, setChildSearch] = useState('');
  const [showChildDropdown, setShowChildDropdown] = useState(false);

  // Récupérer les camps publiés
  const { data: campsData, isLoading: isLoadingCamps } = trpc.camps.list.useQuery({
    limit: 100,
    offset: 0,
    status: 'PUBLISHED',
  });

  // Récupérer les parents
  const { data: parentsData, isLoading: isLoadingParents } = trpc.parents.list.useQuery({
    limit: 100,
    offset: 0,
  });

  // Récupérer les enfants
  const { data: childrenData, isLoading: isLoadingChildren } = trpc.children.list.useQuery({
    limit: 100,
    offset: 0,
  });

  const createRegistrationMutation = trpc.registrations.createByStaff.useMutation({
    onSuccess: () => {
      toast.success('Inscription créée avec succès');
      router.push(`${basePath}/registrations`);
      router.refresh();
    },
    onError: (error) => {
      toast.error(error.message || 'Erreur lors de la création de l\'inscription');
      setIsSubmitting(false);
    },
  });

  const form = useForm<RegistrationFormValues>({
    resolver: zodResolver(registrationFormSchema),
    defaultValues: {
      parentId: '',
      campId: '',
      childId: '',
      specialRequirements: '',
      status: 'PENDING',
    },
  });

  const watchCampId = form.watch('campId');
  const watchParentId = form.watch('parentId');

  // Filtrer les enfants en fonction du parent sélectionné et de la recherche
  const filteredChildren = useMemo(() => {
    if (!childrenData?.children) return [];

    // Filtrer par parent si un parent est sélectionné
    const children = watchParentId
      ? childrenData.children.filter((child) =>
          child.parents.some((parent) => parent.parentId === watchParentId)
        )
      : childrenData.children;

    // Filtrer par recherche
    if (!childSearch.trim()) return children;

    const searchLower = childSearch.toLowerCase();
    return children.filter((child) =>
      `${child.firstName} ${child.lastName}`.toLowerCase().includes(searchLower)
    );
  }, [childrenData, childSearch, watchParentId]);

  useEffect(() => {
    if (watchCampId && campsData) {
      const camp = campsData.camps.find((c) => c.id === watchCampId);
      if (camp) {
        setSelectedCamp(camp);
      }
    }
  }, [watchCampId, campsData]);

  // Réinitialiser l'enfant sélectionné quand le parent change
  useEffect(() => {
    if (watchParentId) {
      form.setValue('childId', '');
      setChildSearch('');
    }
  }, [watchParentId, form]);

  // Fermer le dropdown en cliquant en dehors
  useEffect(() => {
    if (!showChildDropdown) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-child-search]')) {
        setShowChildDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showChildDropdown]);

  const calculateTotalAmount = () => {
    if (!selectedCamp) return 0;
    return selectedCamp.daysCount * selectedCamp.pricePerDay;
  };

  const onSubmit = async (values: RegistrationFormValues) => {
    setIsSubmitting(true);
    createRegistrationMutation.mutate(values);
  };

  if (isLoadingCamps || isLoadingChildren || isLoadingParents) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Informations de l'inscription */}
        <Card>
          <CardHeader>
            <CardTitle>Informations de l'inscription</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Parent */}
            <FormField
              control={form.control}
              name="parentId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Parent</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionnez un parent" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {parentsData?.parents.map((parent) => (
                        <SelectItem key={parent.userId} value={parent.userId}>
                          {parent.firstName} {parent.lastName} - {parent.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Camp */}
            <FormField
              control={form.control}
              name="campId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Camp</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionnez un camp" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {campsData?.camps.map((camp) => (
                        <SelectItem key={camp.id} value={camp.id}>
                          {camp.name} - {camp.location} ({camp.pricePerDay.toLocaleString()} XPF/jour)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Statut de l'inscription */}
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Statut initial</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionnez un statut" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="PENDING">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-yellow-600" />
                          <span>En attente</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="CONFIRMED">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          <span>Confirmée</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="WAITLIST">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-orange-600" />
                          <span>Liste d'attente</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Par défaut: "En attente". Choisissez "Confirmée" pour valider immédiatement.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Enfant avec recherche */}
            <FormField
              control={form.control}
              name="childId"
              render={({ field }) => {
                const selectedChild = childrenData?.children.find(c => c.id === field.value);

                return (
                  <FormItem className="relative" data-child-search>
                    <FormLabel>Enfant</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          placeholder="Rechercher un enfant..."
                          value={childSearch}
                          onChange={(e) => {
                            setChildSearch(e.target.value);
                            setShowChildDropdown(true);
                          }}
                          onFocus={() => setShowChildDropdown(true)}
                          className="pr-10"
                        />
                        {selectedChild && (
                          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                            <Check className="h-4 w-4 text-green-600" />
                          </div>
                        )}
                      </div>
                    </FormControl>

                    {selectedChild && (
                      <FormDescription className="text-xs">
                        Sélectionné: {selectedChild.firstName} {selectedChild.lastName} (
                        {new Date(selectedChild.birthDate).toLocaleDateString('fr-FR')})
                      </FormDescription>
                    )}

                    {/* Dropdown de résultats */}
                    {showChildDropdown && filteredChildren.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-popover text-popover-foreground border rounded-md shadow-lg max-h-60 overflow-auto">
                        {filteredChildren.map((child) => (
                          <button
                            key={child.id}
                            type="button"
                            onClick={() => {
                              field.onChange(child.id);
                              setChildSearch(`${child.firstName} ${child.lastName}`);
                              setShowChildDropdown(false);
                            }}
                            className={cn(
                              'w-full px-3 py-2 text-left text-sm hover:bg-muted focus:bg-muted focus:outline-none',
                              field.value === child.id && 'bg-muted'
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium">
                                {child.firstName} {child.lastName}
                              </span>
                              {field.value === child.id && (
                                <Check className="h-4 w-4 text-green-600" />
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              Né(e) le {new Date(child.birthDate).toLocaleDateString('fr-FR')}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    {showChildDropdown && childSearch && filteredChildren.length === 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-popover text-popover-foreground border rounded-md shadow-lg p-3 text-sm text-muted-foreground">
                        Aucun enfant trouvé pour "{childSearch}"
                      </div>
                    )}

                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            {/* Afficher les détails du camp sélectionné */}
            {selectedCamp && (
              <>
                <div className="rounded-lg border p-4 bg-muted/50">
                  <h4 className="font-semibold mb-2">Détails du camp</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Lieu: </span>
                      <span className="font-medium">{selectedCamp.location}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Prix par jour: </span>
                      <span className="font-medium">
                        {selectedCamp.pricePerDay.toLocaleString()} XPF
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Date limite: </span>
                      <span className="font-medium">
                        {new Date(selectedCamp.registrationDeadline).toLocaleDateString('fr-FR')}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Capacité max: </span>
                      <span className="font-medium">{selectedCamp.maxCapacity}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Période: </span>
                      <span className="font-medium">
                        Du {selectedCamp.startDate ? new Date(selectedCamp.startDate).toLocaleDateString('fr-FR') : '—'} au{' '}
                        {selectedCamp.endDate ? new Date(selectedCamp.endDate).toLocaleDateString('fr-FR') : '—'} ({selectedCamp.daysCount} jours)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Montant total calculé */}
                <div className="rounded-lg border p-4 bg-primary/5">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">
                      Inscription pour toute la durée du camp ({selectedCamp.daysCount} jours)
                    </span>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Montant total</p>
                      <p className="text-2xl font-bold">{calculateTotalAmount().toLocaleString()} XPF</p>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Besoins spéciaux */}
            <FormField
              control={form.control}
              name="specialRequirements"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Besoins spéciaux (optionnel)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Ex: Allergies alimentaires, besoins médicaux particuliers..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={isSubmitting}
          >
            Annuler
          </Button>
          <Button type="submit" disabled={isSubmitting || !selectedCamp}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Créer l'inscription
          </Button>
        </div>
      </form>
    </Form>
  );
}
