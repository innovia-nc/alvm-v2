import { SignUpParentForm } from '@/components/auth/signup-parent-form';
import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Inscription Parent | ALVM',
  description: 'Créez votre compte parent ALVM',
};

export default function SignUpParentPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-3xl font-bold text-gray-900">Créer un compte parent</h2>
        <p className="mt-2 text-sm text-gray-600">
          Inscrivez vos enfants aux camps de vacances
        </p>
      </div>

      {/* Formulaire */}
      <SignUpParentForm />

      {/* Lien connexion */}
      <div className="text-center text-sm">
        <p className="text-gray-600">
          Vous avez déjà un compte ?{' '}
          <Link
            href="/auth/signin"
            className="text-indigo-600 hover:text-indigo-500 font-medium"
          >
            Se connecter
          </Link>
        </p>
      </div>
    </div>
  );
}
