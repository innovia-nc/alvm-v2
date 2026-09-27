'use client';

/**
 * Document Upload Component
 *
 * Composant réutilisable pour uploader des documents PDF avec drag & drop.
 * Supporte la validation de format (PDF uniquement) et de taille (max 5MB).
 */

import { Alert, AlertDescription } from '@/components/ui/alert';

import { cn } from '@/lib/utils';
import { Loader2, Upload } from 'lucide-react';
import { useCallback, useState } from 'react';

// ============================================================================
// TYPES
// ============================================================================

interface DocumentUploadProps {
  /**
   * ID de l'enfant pour upload
   */
  childId: string;
  kind?: 'child' | 'staff';

  /**
   * Callback appelé lors de l'upload réussi
   */
  onUploadComplete: () => void;

  /**
   * Description optionnelle du document
   */
  description?: string;

  /**
   * Classe CSS additionnelle
   */
  className?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function DocumentUpload({
  childId,
  kind = 'child',
  onUploadComplete,
  description,
  className,
}: DocumentUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Maximum 5MB
  const MAX_SIZE = 5 * 1024 * 1024;

  // --------------------------------------------------------------------------
  // VALIDATION
  // --------------------------------------------------------------------------

  const validateFile = useCallback((file: File): string | null => {
    // Vérifier que c'est un PDF
    if (file.type !== 'application/pdf') {
      return 'Format non autorisé. Seuls les fichiers PDF sont acceptés.';
    }

    // Vérifier la taille (max 5MB)
    if (file.size > MAX_SIZE) {
      const maxSizeMB = (MAX_SIZE / (1024 * 1024)).toFixed(0);
      return `Fichier trop volumineux. Taille maximale : ${maxSizeMB}MB`;
    }

    return null;
  }, []);

  // --------------------------------------------------------------------------
  // UPLOAD
  // --------------------------------------------------------------------------

  const handleUpload = useCallback(
    async (file: File) => {
      setError(null);

      // Valider le fichier
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }

      setIsUploading(true);

      try {
        // Créer FormData
        const formData = new FormData();
        formData.append('file', file);
        formData.append(kind === 'staff' ? 'staffId' : 'childId', childId);
        if (description) {
          formData.append('description', description);
        }

        // Appeler l'API route
        const response = await fetch(`/api/upload/${kind}-documents`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Erreur lors de l'upload");
        }

        // Callback de succès
        onUploadComplete();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
      } finally {
        setIsUploading(false);
      }
    },
    [validateFile, childId, description, onUploadComplete],
  );

  // --------------------------------------------------------------------------
  // EVENT HANDLERS
  // --------------------------------------------------------------------------

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleUpload(file);
      }
      // Reset input pour permettre re-sélection du même fichier
      e.target.value = '';
    },
    [handleUpload],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files?.[0];
      if (file) {
        handleUpload(file);
      }
    },
    [handleUpload],
  );

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------

  return (
    <div className={cn('space-y-2', className)}>
      {/* Drop zone */}
      <label
        className={cn(
          'flex h-32 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed bg-card transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
          isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
          isUploading && 'cursor-not-allowed opacity-50',
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          className="sr-only"
          aria-label="Choisir un document PDF"
          accept="application/pdf"
          onChange={handleFileChange}
          disabled={isUploading}
        />

        <div className="flex flex-col items-center justify-center space-y-2 p-4 text-center">
          {isUploading ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p role="status" className="text-sm text-muted-foreground">
                Téléversement en cours…
              </p>
            </>
          ) : (
            <>
              <div className="rounded-full bg-muted p-2">
                <Upload className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Glissez un PDF ici</p>
                <p className="text-xs text-muted-foreground">ou cliquez pour parcourir</p>
              </div>
              <p className="text-xs text-muted-foreground">PDF uniquement - Max 5MB</p>
            </>
          )}
        </div>
      </label>

      {/* Message d'erreur */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
