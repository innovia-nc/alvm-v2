'use client';

import { usePathname } from 'next/navigation';

type DashboardBasePath =
  | '/dashboard/admin'
  | '/dashboard/staff'
  | '/dashboard/parent';

function getDashboardBasePathFromPathname(
  pathname: string,
): DashboardBasePath {
  if (pathname.startsWith('/dashboard/staff')) return '/dashboard/staff';
  if (pathname.startsWith('/dashboard/parent')) return '/dashboard/parent';
  return '/dashboard/admin';
}

export function useDashboardBasePath(): DashboardBasePath {
  const pathname = usePathname();
  return getDashboardBasePathFromPathname(pathname);
}
