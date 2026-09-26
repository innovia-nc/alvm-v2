import { BrandingProvider } from '@/components/providers/branding-provider';
import { getBranding } from '@/server/services/platform-config.service';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { NextAuthSessionProvider } from '@/components/providers/session-provider';
import { TRPCProvider } from '@/lib/trpc';
import { Toaster } from 'sonner';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const branding = await getBranding();
  return { title: branding.name, description: branding.description };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const branding = await getBranding();
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className={inter.className}>
        <NextAuthSessionProvider>
          <TRPCProvider>
            <BrandingProvider initial={branding}>
              <ThemeProvider
                attribute="class"
                defaultTheme="light"
                enableSystem={false}
                disableTransitionOnChange
              >
                {children}
                <Toaster richColors position="top-right" />
              </ThemeProvider>
            </BrandingProvider>
          </TRPCProvider>
        </NextAuthSessionProvider>
      </body>
    </html>
  );
}
