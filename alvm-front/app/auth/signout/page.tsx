'use client';

import { LoadingState } from '@/components/shared/loading-state';
import { signOut } from 'next-auth/react';
import { useEffect } from 'react';

/**
 * Sign Out Page
 *
 * Automatically signs out the user and redirects to home page.
 */
export default function SignOutPage() {
  useEffect(() => {
    signOut({ callbackUrl: '/' });
  }, []);

  return <LoadingState label="Déconnexion en cours…" />;
}
