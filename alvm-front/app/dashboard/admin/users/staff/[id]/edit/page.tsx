'use client';

import { FormActions } from '@/components/shared/form-actions';
import { LoadingState } from '@/components/shared/loading-state';
import { PageHeader } from '@/components/shared/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { trpc } from '@/lib/trpc/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

const editStaffSchema = z.object({
  firstName: z.string().min(2, 'Minimum 2 caractères').max(50),
  lastName: z.string().min(2, 'Minimum 2 caractères').max(50),
  email: z.string().email('Email invalide'),
  phone: z
    .string()
    .regex(/^[\d\s\-\(\)\+]*$/, 'Format téléphone invalide')
    .optional()
    .or(z.literal('')),
});

type EditStaffFormData = z.infer<typeof editStaffSchema>;

type PageProps = {
  params: Promise<{ id: string }>;
};

export default function EditStaffPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const utils = trpc.useUtils();
  const [error, setError] = useState<string | null>(null);

  const { data: staff, isLoading } = trpc.staff.getById.useQuery({ id });

  const updateMutation = trpc.staff.update.useMutation({
    onSuccess: () => {
      utils.staff.list.invalidate();
      utils.staff.getById.invalidate({ id });
      router.push('/dashboard/admin/users/staff');
      router.refresh();
    },
    onError: (err) => {
      setError(err.message || 'Une erreur est survenue');
    },
  });

  const form = useForm<EditStaffFormData>({
    resolver: zodResolver(editStaffSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
    },
  });

  useEffect(() => {
    if (staff) {
      form.reset({
        firstName: staff.firstName,
        lastName: staff.lastName,
        email: staff.email,
        phone: staff.phone ?? '',
      });
    }
  }, [staff, form]);

  async function onSubmit(values: EditStaffFormData) {
    setError(null);
    await updateMutation.mutateAsync({
      id,
      firstName: values.firstName,
      lastName: values.lastName,
      email: values.email,
      phone: values.phone && values.phone.trim() !== '' ? values.phone : undefined,
    });
  }

  if (isLoading) {
    return <LoadingState />;
  }

  if (!staff) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Membre du personnel introuvable</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Modifier un membre du personnel"
        description={`${staff.firstName} ${staff.lastName}`}
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>Prénom</FormLabel>
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
                      <FormLabel required>Nom</FormLabel>
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
                    <FormLabel required>Email</FormLabel>
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

              <FormActions>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                  disabled={updateMutation.isPending}
                >
                  Annuler
                </Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Enregistrer
                </Button>
              </FormActions>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
