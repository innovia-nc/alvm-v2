'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  CalendarDays,
  MapPin,
  Users,
  Banknote,
  User,
  Tag,
} from 'lucide-react';

type CampDetail = {
  id: string;
  name: string;
  description: string;
  campTypeId: string;
  location: string;
  maxCapacity: number;
  startDate: Date | null;
  endDate: Date | null;
  registrationDeadline: Date;
  pricePerDay: number;
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'CANCELLED';
  campType: {
    id: string;
    name: string;
    description: string | null;
  };
  creator: {
    firstName: string;
    lastName: string;
  };
  daysCount: number;
  registrationsCount: number;
  availableSpots: number;
};

interface CampDetailTabProps {
  camp: CampDetail;
}

function formatDate(date: Date | null) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatCurrency(amount: number) {
  return amount.toLocaleString('fr-FR') + ' XPF';
}

export function CampDetailTab({ camp }: CampDetailTabProps) {
  const fillRate =
    camp.maxCapacity > 0
      ? Math.round((camp.registrationsCount / camp.maxCapacity) * 100)
      : 0;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Dates */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            Dates
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Début</span>
            <span className="capitalize">{formatDate(camp.startDate)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Fin</span>
            <span className="capitalize">{formatDate(camp.endDate)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Durée</span>
            <span>{camp.daysCount} jours</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Date limite d&apos;inscription</span>
            <span className="capitalize">{formatDate(camp.registrationDeadline)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Capacité */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-muted-foreground" />
            Capacité
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Inscrits</span>
            <span className="font-medium">
              {camp.registrationsCount} / {camp.maxCapacity}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Places restantes</span>
            <span>{camp.availableSpots}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Taux de remplissage</span>
            <span>{fillRate}%</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2 mt-1">
            <div
              className="bg-primary rounded-full h-2 transition-all"
              style={{ width: `${Math.min(fillRate, 100)}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Tarifs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Banknote className="h-4 w-4 text-muted-foreground" />
            Tarifs
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Prix par jour</span>
            <span className="font-medium">{formatCurrency(camp.pricePerDay)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Prix total</span>
            <span className="font-medium">
              {formatCurrency(camp.pricePerDay * camp.daysCount)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Infos generales */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Tag className="h-4 w-4 text-muted-foreground" />
            Informations
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Type</span>
            <span>{camp.campType.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3 w-3" /> Lieu
            </span>
            <span>{camp.location}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground flex items-center gap-1">
              <User className="h-3 w-3" /> Créateur
            </span>
            <span>
              {camp.creator.firstName} {camp.creator.lastName}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Description */}
      {camp.description && (
        <Card className="md:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {camp.description}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
