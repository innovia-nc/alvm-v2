'use client';
import * as React from 'react';
import { createContext, useContext, useEffect } from 'react';
import { DEFAULT_BRANDING, type Branding } from '@alvm/shared/platform';
import { trpc } from '@/lib/trpc/client';
const BrandingContext = createContext<Branding>(DEFAULT_BRANDING);
export const useBranding = () => useContext(BrandingContext);
export function BrandingProvider({
  children,
  initial,
}: {
  children: React.ReactNode;
  initial: Branding;
}) {
  const { data = initial } = trpc.platform.branding.useQuery(undefined, {
    initialData: initial,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchInterval: 15000,
    staleTime: 0,
  });
  useEffect(() => {
    document.title = data.name;
  }, [data.name]);
  return <BrandingContext.Provider value={data}>{children}</BrandingContext.Provider>;
}
export function ApplicationName() {
  return <>{useBranding().name}</>;
}
export function ApplicationDescription() {
  return <>{useBranding().description}</>;
}
export function SupportLink() {
  const { supportEmail } = useBranding();
  return supportEmail ? (
    <a className="text-primary hover:underline" href={`mailto:${supportEmail}`}>
      Contacter le support
    </a>
  ) : null;
}
