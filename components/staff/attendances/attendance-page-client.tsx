'use client';

import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft, ChevronRight, Users, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { AttendanceGrid } from './attendance-grid';

interface AttendancePageClientProps {
  campId: string;
  showHeader?: boolean;
}

export function AttendancePageClient({ campId, showHeader = true }: AttendancePageClientProps) {
  const [selectedDateIndex, setSelectedDateIndex] = useState(0);
  const utils = trpc.useUtils();

  // Fetch camp info
  const { data: camp, isLoading: isLoadingCamp } = trpc.camps.getById.useQuery({ id: campId });

  // Fetch attendance grid
  const { data: grid, isLoading: isLoadingGrid } = trpc.attendances.getGridForCamp.useQuery({ campId });

  // Mark single attendance
  const markMutation = trpc.attendances.markAttendance.useMutation({
    onSuccess: () => {
      utils.attendances.getGridForCamp.invalidate({ campId });
    },
    onError: (error) => {
      toast.error('Erreur', { description: error.message });
    },
  });

  // Bulk mark attendance
  const bulkMutation = trpc.attendances.markBulkAttendance.useMutation({
    onSuccess: (data) => {
      utils.attendances.getGridForCamp.invalidate({ campId });
      toast.success(`${data.count} pr\u00e9sences marqu\u00e9es`);
    },
    onError: (error) => {
      toast.error('Erreur', { description: error.message });
    },
  });

  // Compute available dates from grid
  const dates = useMemo(() => {
    if (!grid?.dates) return [];
    return grid.dates.map((d) => new Date(d));
  }, [grid?.dates]);

  // Ensure selectedDateIndex is within bounds
  const currentDateIndex = Math.min(selectedDateIndex, Math.max(0, dates.length - 1));
  const selectedDate = dates[currentDateIndex] ?? null;

  // Format date for display
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  // Format date as YYYY-MM-DD for API
  const formatDateISO = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Get children for selected date with their attendance status
  const childrenForDate = useMemo(() => {
    if (!grid?.children || !selectedDate) return [];
    return grid.children.map((child) => {
      const attendance = child.attendances.find((a) => {
        const aDate = new Date(a.date);
        return aDate.toDateString() === selectedDate.toDateString();
      });
      return {
        registrationId: child.registrationId,
        childId: child.childId,
        firstName: child.firstName,
        lastName: child.lastName,
        status: attendance?.status ?? null,
      };
    });
  }, [grid?.children, selectedDate]);

  // Count present children
  const presentCount = childrenForDate.filter(
    (c) => c.status === 'PRESENT' || c.status === 'LATE'
  ).length;

  // Handle mark single attendance
  const handleMarkAttendance = (
    registrationId: string,
    status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED',
    notes?: string
  ) => {
    if (!selectedDate) return;
    markMutation.mutate({
      registrationId,
      date: formatDateISO(selectedDate),
      status,
      notes,
    });
  };

  // Handle mark all present
  const handleMarkAllPresent = () => {
    if (!selectedDate || childrenForDate.length === 0) return;
    bulkMutation.mutate({
      campId,
      date: formatDateISO(selectedDate),
      attendances: childrenForDate.map((child) => ({
        registrationId: child.registrationId,
        status: 'PRESENT' as const,
      })),
    });
  };

  if (isLoadingCamp || isLoadingGrid) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!camp) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">Camp introuvable</p>
        </CardContent>
      </Card>
    );
  }

  if (dates.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">
            Aucune date configur\u00e9e pour ce camp
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Camp name */}
      {showHeader && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{camp.name}</CardTitle>
          </CardHeader>
        </Card>
      )}

      {/* Date navigator + actions */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setSelectedDateIndex(Math.max(0, currentDateIndex - 1))}
            disabled={currentDateIndex === 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="min-w-[280px] text-center">
            <span className="font-medium capitalize">
              {selectedDate ? formatDate(selectedDate) : '\u2014'}
            </span>
            <span className="text-xs text-muted-foreground ml-2">
              ({currentDateIndex + 1}/{dates.length})
            </span>
          </div>

          <Button
            variant="outline"
            size="icon"
            onClick={() => setSelectedDateIndex(Math.min(dates.length - 1, currentDateIndex + 1))}
            disabled={currentDateIndex === dates.length - 1}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-4">
          {/* Summary counter */}
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            <span>
              {presentCount}/{childrenForDate.length} pr\u00e9sents
            </span>
          </div>

          {/* Bulk action */}
          <Button
            onClick={handleMarkAllPresent}
            disabled={bulkMutation.isPending || childrenForDate.length === 0}
            size="sm"
          >
            <CheckCircle className="mr-2 h-4 w-4" />
            Tous pr\u00e9sents
          </Button>
        </div>
      </div>

      {/* Attendance grid */}
      {childrenForDate.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Aucun enfant inscrit \u00e0 ce camp
            </p>
          </CardContent>
        </Card>
      ) : (
        <AttendanceGrid
          children={childrenForDate}
          onMarkAttendance={handleMarkAttendance}
          isPending={markMutation.isPending}
        />
      )}
    </div>
  );
}
