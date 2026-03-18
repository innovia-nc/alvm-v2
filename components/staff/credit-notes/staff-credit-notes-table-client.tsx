'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { useServerPagination } from '@/hooks/use-server-pagination';
import { DataTableServer } from '@/components/ui/data-table-server';
import { staffCreditNoteColumns } from './columns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function StaffCreditNotesTableClient() {
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Hook de pagination server-side
  const pagination = useServerPagination({ defaultPageSize: 20 });

  // Query tRPC avec pagination
  const { data, isLoading } = trpc.creditNotes.list.useQuery({
    limit: pagination.limit,
    offset: pagination.offset,
  });

  // Filtrer les donn\u00e9es par statut c\u00f4t\u00e9 client
  const filteredData = (data?.creditNotes || []).filter((item) => {
    if (statusFilter === 'all') return true;
    return item.status === statusFilter;
  });

  return (
    <div className="space-y-4">
      {/* Filtre par statut */}
      <div className="flex gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filtrer par statut" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="DRAFT">Brouillons</SelectItem>
            <SelectItem value="SENT">\u00c9mis</SelectItem>
            <SelectItem value="CANCELLED">Annul\u00e9s</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTableServer
        columns={staffCreditNoteColumns}
        data={filteredData}
        totalCount={data?.total || 0}
        isLoading={isLoading}
        pagination={pagination}
        searchKey="creditNoteNumber"
        searchPlaceholder="Rechercher par num\u00e9ro, facture, parent ou raison..."
      />
    </div>
  );
}
