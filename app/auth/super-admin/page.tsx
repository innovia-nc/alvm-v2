import { ApplicationName } from '@/components/providers/branding-provider';
import { Suspense } from 'react';
import Link from 'next/link';
import { SignInForm } from '@/components/auth/signin-form';

export default function SuperAdminSignInPage() {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Connexion super admin</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Administration globale de l’application <ApplicationName />
        </p>
      </div>
      <Suspense fallback={<p>Chargement…</p>}>
        <SignInForm superAdmin />
      </Suspense>
      <div className="flex justify-between text-sm text-primary">
        <Link href="/auth/reset-password?portal=super-admin">Mot de passe oublié ?</Link>
        <Link href="/auth/signin">Connexion habituelle</Link>
      </div>
    </div>
  );
}
