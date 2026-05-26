import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { NextAuthSessionProvider } from '@/components/providers/session-provider';
import { TRPCProvider } from '@/lib/trpc';
import { Toaster } from 'sonner';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'ALVM - Gestion de Camps de Vacances',
  description: 'Application de gestion de camps de vacances pour enfants',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className={inter.className}>
        <NextAuthSessionProvider>
          <TRPCProvider>
            <ThemeProvider
              attribute="class"
              defaultTheme="light"
              enableSystem={false}
              disableTransitionOnChange
            >
              {children}
              <Toaster richColors position="top-right" />
            </ThemeProvider>
          </TRPCProvider>
        </NextAuthSessionProvider>
      </body>
    </html>
  );
}
