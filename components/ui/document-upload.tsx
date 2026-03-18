/**
 * Document Upload Component
 *
 * Composant réutilisable pour uploader des documents PDF avec drag & drop.
 * Supporte la validation de format (PDF uniquement) et de taille (max 5MB).
 */

'use client';

import { useCallback, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

interface DocumentUploadProps {
  /**
   * ID de l'enfant pour upload
   */
  childId: string;

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

  const validateFile = useCallback(
    (file: File): string | null => {
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
    },
    []
  );

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
        formData.append('childId', childId);
        if (description) {
          formData.append('description', description);
        }

        // Appeler l'API route
        const response = await fetch('/api/upload/child-documents', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Erreur lors de l\'upload');
        }

        // Callback de succès
        onUploadComplete();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
      } finally {
        setIsUploading(false);
      }
    },
    [validateFile, childId, description, onUploadComplete]
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
    [handleUpload]
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
    [handleUpload]
  );

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------

  return (
    <div className={cn('space-y-2', className)}>
      {/* Drop zone */}
      <label
        className={cn(
          'flex h-32 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-gray-300 hover:border-primary/50',
          isUploading && 'cursor-not-allowed opacity-50'
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          className="hidden"
          accept="application/pdf"
          onChange={handleFileChange}
          disabled={isUploading}
        />

        <div className="flex flex-col items-center justify-center space-y-2 p-4 text-center">
          {isUploading ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              <p className="text-sm text-gray-600">Upload en cours...</p>
            </>
          ) : (
            <>
              <div className="rounded-full bg-gray-100 p-2">
                <Upload className="h-5 w-5 text-gray-600" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-gray-700">
                  Glissez un PDF ici
                </p>
                <p className="text-xs text-gray-500">
                  ou cliquez pour parcourir
                </p>
              </div>
              <p className="text-xs text-gray-400">
                PDF uniquement - Max 5MB
              </p>
            </>
          )}
        </div>
      </label>

      {/* Message d'erreur */}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}
    </div>
  );
}
