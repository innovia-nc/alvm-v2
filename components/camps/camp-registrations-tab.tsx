'use client';

import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc/client';
import { useServerPagination } from '@/hooks/use-server-pagination';
import { DataTableServer } from '@/components/ui/data-table-server';
import {
  createCampRegistrationColumns,
  type CampRegistrationType,
} from './camp-registrations-columns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

type StatusFilter = 'all' | 'PENDING' | 'CONFIRMED' | 'WAITLIST' | 'CANCELLED';

interface CampRegistrationsTabProps {
  campId: string;
  basePath: string;
}

export function CampRegistrationsTab({ campId, basePath }: CampRegistrationsTabProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const pagination = useServerPagination({ defaultPageSize: 20 });

  const { data, isLoading } = trpc.registrations.list.useQuery({
    campId,
    limit: pagination.limit,
    offset: pagination.offset,
    ...(statusFilter !== 'all' && { status: statusFilter }),
    ...(searchTerm && searchTerm.trim() !== '' && { search: searchTerm }),
  });

  const columns = useMemo(
    () => createCampRegistrationColumns(basePath),
    [basePath]
  );

  const registrations: CampRegistrationType[] = useMemo(() => {
    if (!data?.registrations) return [];
    return data.registrations.map((r) => ({
      id: r.id,
      status: r.status,
      createdAt: r.createdAt,
      child: r.child,
      parent: r.parent,
      totalAmount: r.totalAmount,
    }));
  }, [data?.registrations]);

  const hasActiveFilters = statusFilter !== 'all' || searchTerm !== '';

  function handleSearchChange(search: string) {
    setSearchTerm(search);
    pagination.resetToFirstPage();
  }

  function resetFilters() {
    setStatusFilter('all');
    setSearchTerm('');
    pagination.resetToFirstPage();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 items-end">
        <div className="min-w-[180px]">
          <Label htmlFor="reg-status-filter" className="mb-2 block">
            Filtrer par statut
          </Label>
          <Select
            value={statusFilter}
            onValueChange={(val) => {
              setStatusFilter(val as StatusFilter);
              pagination.resetToFirstPage();
            }}
          >
            <SelectTrigger id="reg-status-filter">
              <SelectValue placeholder="Tous les statuts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="PENDING">En attente</SelectItem>
              <SelectItem value="CONFIRMED">Confirmées</SelectItem>
              <SelectItem value="WAITLIST">Liste d&apos;attente</SelectItem>
              <SelectItem value="CANCELLED">Annulées</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {hasActiveFilters && (
          <Button variant="outline" onClick={resetFilters} size="default">
            <X className="mr-2 h-4 w-4" />
            Réinitialiser
          </Button>
        )}
      </div>

      <DataTableServer
        columns={columns}
        data={registrations}
        totalCount={data?.total || 0}
        isLoading={isLoading}
        pagination={pagination}
        searchKey="child.firstName"
        searchPlaceholder="Rechercher par nom..."
        onSearchChange={handleSearchChange}
      />
    </div>
  );
}
