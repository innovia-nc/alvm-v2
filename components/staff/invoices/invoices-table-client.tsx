'use client';

import { trpc } from '@/lib/trpc/client';
import { useServerPagination } from '@/hooks/use-server-pagination';
import { DataTableServer } from '@/components/ui/data-table-server';
import { staffInvoiceColumns } from './columns';

export function InvoicesTableClient() {
  // Hook de pagination server-side
  const pagination = useServerPagination({ defaultPageSize: 20 });

  // Query tRPC avec pagination
  const { data, isLoading } = trpc.invoices.list.useQuery({
    limit: pagination.limit,
    offset: pagination.offset,
  });

  return (
    <div className="space-y-4">
      <DataTableServer
        columns={staffInvoiceColumns}
        data={data?.invoices || []}
        totalCount={data?.total || 0}
        isLoading={isLoading}
        pagination={pagination}
        searchKey="invoiceNumber"
        searchPlaceholder="Rechercher par numéro ou statut..."
      />
    </div>
  );
}
