'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { useServerPagination } from '@/hooks/use-server-pagination';
import { DataTableServer } from '@/components/ui/data-table-server';
import { staffParentColumns } from './columns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function StaffParentsTableClient() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('active');

  // Hook de pagination server-side
  const pagination = useServerPagination({ defaultPageSize: 20 });

  // Query tRPC avec pagination, recherche et filtre de statut
  const { data, isLoading } = trpc.parents.list.useQuery({
    limit: pagination.limit,
    offset: pagination.offset,
    search,
    status,
  });

  return (
    <div className="space-y-4">
      {/* Filtre de statut */}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Statut :</span>
        <Select
          value={status}
          onValueChange={(value: 'all' | 'active' | 'inactive') => {
            setStatus(value);
            pagination.resetToFirstPage();
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Actifs</SelectItem>
            <SelectItem value="inactive">Inactifs</SelectItem>
            <SelectItem value="all">Tous</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTableServer
        columns={staffParentColumns}
        data={data?.parents || []}
        totalCount={data?.total || 0}
        isLoading={isLoading}
        pagination={pagination}
        searchKey="email"
        searchPlaceholder="Rechercher par nom, email ou téléphone..."
        onSearchChange={(value) => setSearch(value)}
      />
    </div>
  );
}
