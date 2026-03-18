import { SignInForm } from '@/components/auth/signin-form';
import { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

export const metadata: Metadata = {
  title: 'Connexion | ALVM',
  description: 'Connectez-vous à votre compte ALVM',
};

export default function SignInPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-3xl font-bold text-gray-900">Connexion</h2>
        <p className="mt-2 text-sm text-gray-600">
          Accédez à votre espace personnel
        </p>
      </div>

      {/* Formulaire */}
      <Suspense fallback={<div className="text-center text-muted-foreground">Chargement...</div>}>
        <SignInForm />
      </Suspense>

      {/* Liens */}
      <div className="space-y-3 text-center text-sm">
        <div>
          <Link
            href="/auth/reset-password"
            className="text-indigo-600 hover:text-indigo-500 font-medium"
          >
            Mot de passe oublié ?
          </Link>
        </div>

        <div className="pt-4 border-t border-gray-200">
          <p className="text-gray-600">
            Pas encore de compte ?{' '}
            <Link
              href="/auth/signup/parent"
              className="text-indigo-600 hover:text-indigo-500 font-medium"
            >
              Créer un compte parent
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
