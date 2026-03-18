import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

/**
 * Authentication Error Page
 *
 * Displayed when an error occurs during authentication.
 * Shows user-friendly error messages and provides navigation back to signin.
 */
export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const error = params.error;

  // Map error codes to user-friendly messages
  const errorMessages: Record<string, { title: string; description: string }> = {
    Configuration: {
      title: 'Erreur de configuration',
      description: 'Le serveur rencontre un problème de configuration. Veuillez contacter l\'administrateur.',
    },
    AccessDenied: {
      title: 'Accès refusé',
      description: 'Vous n\'avez pas l\'autorisation d\'accéder à cette ressource.',
    },
    Verification: {
      title: 'Erreur de vérification',
      description: 'Le lien de vérification est invalide ou a expiré.',
    },
    Default: {
      title: 'Erreur d\'authentification',
      description: 'Une erreur inattendue s\'est produite lors de l\'authentification.',
    },
  };

  const errorInfo = errorMessages[error || 'Default'] || errorMessages.Default!;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <div className="rounded-full bg-red-100 p-3">
            <AlertCircle className="h-8 w-8 text-red-600" />
          </div>
        </div>
        <h2 className="text-3xl font-bold text-gray-900">{errorInfo.title}</h2>
      </div>

      {/* Error Message */}
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Erreur</AlertTitle>
        <AlertDescription>{errorInfo.description}</AlertDescription>
      </Alert>

      {/* Error Code (for debugging) */}
      {error && (
        <div className="text-center text-sm text-gray-500">
          Code d'erreur : <code className="bg-gray-100 px-2 py-1 rounded">{error}</code>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-3">
        <Button asChild className="w-full">
          <Link href="/auth/signin">Retour à la connexion</Link>
        </Button>
        <Button asChild variant="outline" className="w-full">
          <Link href="/">Retour à l'accueil</Link>
        </Button>
      </div>

      {/* Support */}
      <div className="text-center text-sm text-gray-600">
        <p>
          Besoin d'aide ?{' '}
          <a href="mailto:support@alvm.nc" className="text-indigo-600 hover:text-indigo-500 font-medium">
            Contactez le support
          </a>
        </p>
      </div>
    </div>
  );
}
