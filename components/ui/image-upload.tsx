/**
 * Image Upload Component
 *
 * Composant réutilisable pour uploader une image avec drag & drop.
 * Supporte la prévisualisation, la validation de format et de taille.
 */

'use client';

import { useCallback, useState } from 'react';
import { X, Loader2, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ============================================================================
// POLITIQUE DE FICHIER
// ============================================================================

// Formats et taille etaient des props (`accept`, `maxSize`) qu'aucun appelant
// n'a jamais positionnees : le seul ecran qui monte ce composant est
// `/dashboard/admin/settings` (logo de l'association). Ce sont donc des
// constantes, comme dans `components/ui/document-upload.tsx` (`MAX_SIZE`).
// Elles portent a la fois la validation et le texte affiche a l'utilisateur —
// les laisser configurables sans configurateur, c'etait autoriser les deux a
// diverger. Sixieme passe de code mort.
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml'];
const MAX_SIZE = 2 * 1024 * 1024; // 2 Mo

// ============================================================================
// TYPES
// ============================================================================

interface ImageUploadProps {
  /**
   * URL de l'image actuelle (si existe)
   */
  value?: string | null;

  /**
   * Callback appelé lors de l'upload réussi
   */
  onUpload: (url: string) => void;

  /**
   * Callback appelé lors de la suppression
   */
  onRemove: () => void;

  /**
   * Classe CSS additionnelle
   */
  className?: string;

  /**
   * État de chargement externe
   */
  isLoading?: boolean;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ImageUpload({
  value,
  onUpload,
  onRemove,
  className,
  isLoading = false,
}: ImageUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --------------------------------------------------------------------------
  // VALIDATION
  // --------------------------------------------------------------------------

  const validateFile = useCallback((file: File): string | null => {
    // Vérifier le type MIME
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return `Format non autorisé. Formats acceptés : ${ACCEPTED_TYPES.map(
        (t) => t.split('/')[1]?.toUpperCase() || 'inconnu'
      ).join(', ')}`;
    }

    // Vérifier la taille
    if (file.size > MAX_SIZE) {
      const maxSizeMB = (MAX_SIZE / (1024 * 1024)).toFixed(1);
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

        // Appeler l'API route
        const response = await fetch('/api/upload/logo', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Erreur lors de l\'upload');
        }

        const data = await response.json();

        // Callback de succès
        onUpload(data.url);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
      } finally {
        setIsUploading(false);
      }
    },
    [validateFile, onUpload]
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

  const loading = isLoading || isUploading;

  // Si une image existe déjà
  if (value) {
    return (
      <div className={cn('space-y-4', className)}>
        <div className="relative inline-block">
          {/* Preview */}
          <div className="relative h-40 w-40 overflow-hidden rounded-lg border-2 border-gray-200">
            <img
              src={value}
              alt="Logo organisation"
              className="h-full w-full object-contain"
            />
          </div>

          {/* Bouton de suppression */}
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute -right-2 -top-2 h-8 w-8 rounded-full"
            onClick={onRemove}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <X className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Message d'information */}
        <p className="text-xs text-gray-500">
          Cliquez sur la croix pour supprimer le logo actuel.
        </p>
      </div>
    );
  }

  // Zone d'upload
  return (
    <div className={cn('space-y-2', className)}>
      {/* Drop zone */}
      <label
        className={cn(
          'flex h-40 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed transition-colors',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-gray-300 hover:border-primary/50',
          loading && 'cursor-not-allowed opacity-50'
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input
          type="file"
          className="hidden"
          accept={ACCEPTED_TYPES.join(',')}
          onChange={handleFileChange}
          disabled={loading}
        />

        <div className="flex flex-col items-center justify-center space-y-2 p-6 text-center">
          {loading ? (
            <>
              <Loader2 className="h-10 w-10 animate-spin text-gray-400" />
              <p className="text-sm text-gray-600">Upload en cours...</p>
            </>
          ) : (
            <>
              <div className="rounded-full bg-gray-100 p-3">
                <ImageIcon className="h-6 w-6 text-gray-600" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-gray-700">
                  Glissez une image ici
                </p>
                <p className="text-xs text-gray-500">
                  ou cliquez pour parcourir
                </p>
              </div>
              <p className="text-xs text-gray-400">
                PNG, JPG, SVG • Max {(MAX_SIZE / (1024 * 1024)).toFixed(0)}MB
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
