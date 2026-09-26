import { SignInForm } from '@/components/auth/signin-form';
import Link from 'next/link';
import { Suspense } from 'react';

export default function SignInPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Bienvenue sur votre espace
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">Accédez à votre espace personnel</p>
      </div>

      {/* Formulaire */}
      <Suspense fallback={<div className="text-center text-muted-foreground">Chargement...</div>}>
        <SignInForm />
      </Suspense>

      {/* Liens */}
      <div className="text-center text-sm">
        <Link href="/auth/reset-password" className="text-primary hover:underline font-medium">
          Mot de passe oublié ?
        </Link>
      </div>
    </div>
  );
}
