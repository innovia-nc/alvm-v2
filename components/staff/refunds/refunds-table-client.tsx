'use client';

import { trpc } from '@/lib/trpc/client';
import { useServerPagination } from '@/hooks/use-server-pagination';
import { DataTableServer } from '@/components/ui/data-table-server';
import { staffRefundColumns } from './columns';

export function RefundsTableClient() {
  // Hook de pagination server-side
  const pagination = useServerPagination({ defaultPageSize: 20 });

  // Query tRPC avec pagination
  const { data, isLoading } = trpc.refunds.list.useQuery({
    limit: pagination.limit,
    offset: pagination.offset,
  });

  return (
    <div className="space-y-4">
      <DataTableServer
        columns={staffRefundColumns}
        data={data?.refunds || []}
        totalCount={data?.total || 0}
        isLoading={isLoading}
        pagination={pagination}
        searchKey="reference"
        searchPlaceholder="Rechercher par avoir, parent ou méthode..."
      />
    </div>
  );
}
