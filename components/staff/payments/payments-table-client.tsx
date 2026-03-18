'use client';

import { trpc } from '@/lib/trpc/client';
import { useServerPagination } from '@/hooks/use-server-pagination';
import { DataTableServer } from '@/components/ui/data-table-server';
import { staffPaymentColumns } from './columns';

export function PaymentsTableClient() {
  // Hook de pagination server-side
  const pagination = useServerPagination({ defaultPageSize: 20 });

  // Query tRPC avec pagination
  const { data, isLoading } = trpc.payments.list.useQuery({
    limit: pagination.limit,
    offset: pagination.offset,
  });

  return (
    <div className="space-y-4">
      <DataTableServer
        columns={staffPaymentColumns}
        data={data?.payments || []}
        totalCount={data?.total || 0}
        isLoading={isLoading}
        pagination={pagination}
        searchKey="reference"
        searchPlaceholder="Rechercher par facture, parent, m\u00e9thode ou r\u00e9f\u00e9rence..."
      />
    </div>
  );
}
