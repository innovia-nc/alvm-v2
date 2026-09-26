'use client';

import { FilterBar } from '@/components/shared/filter-bar';
import { DataTableServer } from '@/components/ui/data-table-server';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useServerPagination } from '@/hooks/use-server-pagination';
import { trpc } from '@/lib/trpc/client';
import { useState } from 'react';
import { staffCreditNoteColumns } from './columns';

export function StaffCreditNotesTableClient() {
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Terme de recherche soumis (validation « Entrée » / bouton — US-UX-01).
  const [search, setSearch] = useState('');

  // Hook de pagination server-side
  const pagination = useServerPagination({ defaultPageSize: 20 });

  // Query tRPC avec pagination
  const {
    data,
    isLoading,
    error: listError,
    refetch: retryList,
  } = trpc.creditNotes.list.useQuery({
    sortBy: pagination.sortBy as 'creditNoteNumber' | 'issueDate' | 'totalAmount' | undefined,
    sortOrder: pagination.sortOrder,
    limit: pagination.limit,
    offset: pagination.offset,
    search,
  });

  // Filtrer les données par statut côté client
  const filteredData = (data?.creditNotes || []).filter((item) => {
    if (statusFilter === 'all') return true;
    return item.status === statusFilter;
  });

  return (
    <div className="space-y-4">
      {/* Filtre par statut */}
      <FilterBar>
        <div className="grid w-full gap-2 sm:w-56">
          <Label htmlFor="list-status-filter">Statut</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full" id="list-status-filter">
              <SelectValue placeholder="Filtrer par statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="DRAFT">Brouillons</SelectItem>
              <SelectItem value="SENT">Émis</SelectItem>
              <SelectItem value="CANCELLED">Annulés</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </FilterBar>

      <DataTableServer
        error={listError}
        onRetry={retryList}
        sortableColumns={['creditNoteNumber', 'issueDate', 'totalAmount']}
        columns={staffCreditNoteColumns}
        data={filteredData}
        totalCount={data?.total || 0}
        isLoading={isLoading}
        pagination={pagination}
        searchKey="creditNoteNumber"
        searchPlaceholder="Rechercher par numéro, facture, parent ou raison..."
        search={search}
        onSearchChange={setSearch}
      />
    </div>
  );
}
