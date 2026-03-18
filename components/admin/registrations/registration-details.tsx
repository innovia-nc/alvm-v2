'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, FileText, Trash2, Edit } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import Link from 'next/link';

type Registration = {
  id: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'WAITLIST';
  registrationDate: Date;
  specialRequirements: string | null;
  createdAt: Date;
  updatedAt: Date;
  camp: {
    id: string;
    name: string;
    location: string;
    pricePerDay: number;
    registrationDeadline: Date;
    status: string;
    startDate: Date | string | null;
    endDate: Date | string | null;
    daysCount: number;
  };
  child: {
    id: string;
    firstName: string;
    lastName: string;
    birthDate: Date;
  };
  parent: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
  totalAmount: number;
  invoiceId: string | null;
};

const statusLabels: Record<Registration['status'], string> = {
  PENDING: 'En attente',
  CONFIRMED: 'Confirmée',
  CANCELLED: 'Annulée',
  WAITLIST: 'Liste d\'attente',
};

const statusVariants: Record<Registration['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  PENDING: 'outline',
  CONFIRMED: 'default',
  CANCELLED: 'destructive',
  WAITLIST: 'secondary',
};

export function RegistrationDetails({ registration }: { registration: Registration }) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteRegistrationMutation = trpc.registrations.delete.useMutation({
    onSuccess: () => {
      toast.success('Inscription supprimée avec succès');
      router.push('/dashboard/admin/registrations');
      router.refresh();
    },
    onError: (error) => {
      toast.error(error.message || 'Erreur lors de la suppression de l\'inscription');
      setIsDeleting(false);
    },
  });

  const handleDelete = async () => {
    setIsDeleting(true);
    deleteRegistrationMutation.mutate({ id: registration.id });
  };

  return (
    <div className="space-y-6">
      {/* Informations de l'inscription */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Informations de l'inscription</CardTitle>
            <Badge variant={statusVariants[registration.status]}>
              {statusLabels[registration.status]}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Date d'inscription</p>
              <p className="font-medium">
                {new Date(registration.registrationDate).toLocaleDateString('fr-FR')}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Montant total</p>
              <p className="text-2xl font-bold">{registration.totalAmount.toLocaleString()} XPF</p>
            </div>
          </div>

          {registration.specialRequirements && (
            <div>
              <p className="text-sm text-muted-foreground mb-1">Besoins spéciaux</p>
              <p className="text-sm">{registration.specialRequirements}</p>
            </div>
          )}

          <div className="pt-4 border-t">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Créé le</p>
                <p>{new Date(registration.createdAt).toLocaleString('fr-FR')}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Modifié le</p>
                <p>{new Date(registration.updatedAt).toLocaleString('fr-FR')}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Informations du camp */}
      <Card>
        <CardHeader>
          <CardTitle>Camp</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div>
                <p className="text-sm text-muted-foreground">Nom du camp</p>
                <p className="font-semibold text-lg">{registration.camp.name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Lieu</p>
                <p className="font-medium">{registration.camp.location}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Prix par jour</p>
                <p className="font-medium">{registration.camp.pricePerDay.toLocaleString()} XPF</p>
              </div>
            </div>
            <Link href={`/dashboard/admin/camps/${registration.camp.id}`}>
              <Button variant="outline" size="sm">
                <FileText className="mr-2 h-4 w-4" />
                Voir le camp
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Informations de l'enfant */}
      <Card>
        <CardHeader>
          <CardTitle>Enfant</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div>
              <p className="text-sm text-muted-foreground">Nom complet</p>
              <p className="font-semibold">
                {registration.child.firstName} {registration.child.lastName}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Date de naissance</p>
              <p className="font-medium">
                {new Date(registration.child.birthDate).toLocaleDateString('fr-FR')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Informations du parent */}
      <Card>
        <CardHeader>
          <CardTitle>Parent</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div>
              <p className="text-sm text-muted-foreground">Nom complet</p>
              <p className="font-semibold">
                {registration.parent.firstName} {registration.parent.lastName}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Email</p>
              <p className="font-medium">{registration.parent.email}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Téléphone</p>
              <p className="font-medium">{registration.parent.phone}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Période du camp */}
      <Card>
        <CardHeader>
          <CardTitle>Période du camp</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Du</p>
                <p className="font-medium">
                  {registration.camp.startDate
                    ? new Date(registration.camp.startDate).toLocaleDateString('fr-FR', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })
                    : 'Non défini'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Au</p>
                <p className="font-medium">
                  {registration.camp.endDate
                    ? new Date(registration.camp.endDate).toLocaleDateString('fr-FR', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })
                    : 'Non défini'}
                </p>
              </div>
            </div>
            <div className="pt-3 border-t">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Nombre de jours</p>
                <p className="font-semibold">{registration.camp.daysCount} jour{registration.camp.daysCount > 1 ? 's' : ''}</p>
              </div>
              <div className="flex items-center justify-between mt-2">
                <p className="text-sm text-muted-foreground">Prix par jour</p>
                <p className="font-medium">{registration.camp.pricePerDay.toLocaleString()} XPF</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Facture associée */}
      {registration.invoiceId && (
        <Card>
          <CardHeader>
            <CardTitle>Facture</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href={`/dashboard/admin/invoices/${registration.invoiceId}`}>
              <Button variant="outline" size="sm">
                <FileText className="mr-2 h-4 w-4" />
                Voir la facture
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-4">
        <Button variant="outline" onClick={() => router.back()}>
          Retour
        </Button>
        <Button variant="outline" asChild>
          <Link href={`/dashboard/admin/registrations/${registration.id}/edit`}>
            <Edit className="mr-2 h-4 w-4" />
            Modifier
          </Link>
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={isDeleting}>
              {isDeleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Supprimer
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
              <AlertDialogDescription>
                Êtes-vous sûr de vouloir supprimer cette inscription ? Cette action est irréversible.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Supprimer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
