import Link from 'next/link';
import { ArrowLeft, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Réinitialisation du mot de passe | ALVM',
  description: 'Réinitialisez votre mot de passe ALVM',
};

/**
 * Reset Password Page (Placeholder)
 *
 * TODO: Implement password reset functionality with email verification
 * For now, displays a message to contact admin
 */
export default function ResetPasswordPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <div className="rounded-full bg-indigo-100 p-3">
            <Mail className="h-8 w-8 text-indigo-600" />
          </div>
        </div>
        <h2 className="text-3xl font-bold text-gray-900">Mot de passe oublié</h2>
        <p className="mt-2 text-sm text-gray-600">
          Réinitialisez votre mot de passe
        </p>
      </div>

      {/* Information Message */}
      <Alert>
        <Mail className="h-4 w-4" />
        <AlertDescription>
          <p className="font-medium mb-2">Fonctionnalité en cours de développement</p>
          <p className="text-sm">
            Pour réinitialiser votre mot de passe, veuillez contacter un administrateur
            à l'adresse{' '}
            <a
              href="mailto:admin@alvm.nc"
              className="text-indigo-600 hover:text-indigo-500 font-medium"
            >
              admin@alvm.nc
            </a>
          </p>
        </AlertDescription>
      </Alert>

      {/* Actions */}
      <div className="flex flex-col gap-3">
        <Button asChild variant="outline" className="w-full">
          <Link href="/auth/signin">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Retour à la connexion
          </Link>
        </Button>
      </div>

      {/* Support */}
      <div className="text-center text-sm text-gray-600">
        <p>
          Besoin d'aide ?{' '}
          <a
            href="mailto:support@alvm.nc"
            className="text-indigo-600 hover:text-indigo-500 font-medium"
          >
            Contactez le support
          </a>
        </p>
      </div>
    </div>
  );
}
