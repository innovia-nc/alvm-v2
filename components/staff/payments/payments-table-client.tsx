'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';
import { useServerPagination } from '@/hooks/use-server-pagination';
import { DataTableServer } from '@/components/ui/data-table-server';
import { staffPaymentColumns } from './columns';

export function PaymentsTableClient() {
  // Terme de recherche soumis (validation « Entrée » / bouton — US-UX-01).
  const [search, setSearch] = useState('');

  // Hook de pagination server-side
  const pagination = useServerPagination({ defaultPageSize: 20 });

  // Query tRPC avec pagination
  const { data, isLoading, error: listError, refetch: retryList } = trpc.payments.list.useQuery({
    sortBy: pagination.sortBy as 'paymentDate' | 'amount' | undefined,
    sortOrder: pagination.sortOrder,
    limit: pagination.limit,
    offset: pagination.offset,
    search,
  });

  return (
    <div className="space-y-4">
      <DataTableServer
        error={listError} onRetry={retryList} sortableColumns={['paymentDate', 'amount']}
        columns={staffPaymentColumns}
        data={data?.payments || []}
        totalCount={data?.total || 0}
        isLoading={isLoading}
        pagination={pagination}
        searchKey="reference"
        searchPlaceholder="Rechercher par facture, parent, méthode ou référence..."
        onSearchChange={setSearch}
      />
    </div>
  );
}
