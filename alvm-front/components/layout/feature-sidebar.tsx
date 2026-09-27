'use client';
import { trpc } from '@/lib/trpc/client';
import { DashboardSidebar } from './dashboard-sidebar';
export function FeatureSidebar({ role }: { role: 'parent' | 'staff' | 'admin' | 'super-admin' }) {
  const { data } = trpc.features.get.useQuery(undefined, {
    enabled: role !== 'super-admin',
    refetchInterval: 15000,
  });
  return <DashboardSidebar role={role} features={data} />;
}
