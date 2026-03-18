/**
 * Child Documents Section Component
 *
 * Section complète pour gérer les documents d'un enfant:
 * - Upload de nouveaux documents PDF
 * - Liste des documents existants
 * - Génération PDF de la fiche enfant
 *
 * Permissions:
 * - PARENT: peut uploader et voir ses documents
 * - STAFF/ADMIN: peut uploader, voir et supprimer tous les documents
 */

'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DocumentUpload } from '@/components/ui/document-upload';
import { ChildDocumentsTable } from '@/components/shared/child-documents-table';
import { FileText, Download, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { toast } from 'sonner';

// ============================================================================
// TYPES
// ============================================================================

interface ChildDocumentsSectionProps {
  /**
   * ID de l'enfant
   */
  childId: string;

  /**
   * Rôle de l'utilisateur connecté
   */
  userRole: 'PARENT' | 'STAFF' | 'ADMIN';

  /**
   * Classe CSS additionnelle
   */
  className?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ChildDocumentsSection({
  childId,
  userRole,
  className,
}: ChildDocumentsSectionProps) {
  const [showUpload, setShowUpload] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  // --------------------------------------------------------------------------
  // QUERIES
  // --------------------------------------------------------------------------

  const {
    data: documents = [],
    isLoading: isLoadingDocs,
    refetch: refetchDocuments,
  } = trpc.childDocuments.list.useQuery({ childId });

  const {
    data: count = 0,
    refetch: refetchCount,
  } = trpc.childDocuments.count.useQuery({ childId });

  // --------------------------------------------------------------------------
  // HANDLERS
  // --------------------------------------------------------------------------

  const handleUploadComplete = () => {
    // Refresh la liste et le compteur
    refetchDocuments();
    refetchCount();
    setShowUpload(false);
    toast.success('Document ajouté avec succès');
  };

  const handleGeneratePDF = async () => {
    try {
      setIsGeneratingPDF(true);

      // Appeler l'API route pour générer le PDF
      const response = await fetch(`/api/generate/child-profile/${childId}`);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erreur lors de la génération du PDF');
      }

      // Récupérer le blob PDF
      const blob = await response.blob();

      // Extraire le nom du fichier depuis Content-Disposition
      const contentDisposition = response.headers.get('Content-Disposition');
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename = filenameMatch?.[1] ?? 'fiche-enfant.pdf';

      // Créer un lien de téléchargement
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success('Fiche enfant générée avec succès');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Erreur lors de la génération du PDF', {
        description: error instanceof Error ? error.message : 'Une erreur est survenue',
      });
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // --------------------------------------------------------------------------
  // PERMISSIONS
  // --------------------------------------------------------------------------

  const canDelete = userRole === 'STAFF' || userRole === 'ADMIN';

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Documents
            </CardTitle>
            <CardDescription>
              Documents PDF liés à cet enfant ({count})
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleGeneratePDF}
              disabled={isGeneratingPDF}
            >
              {isGeneratingPDF ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Génération...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Fiche enfant (PDF)
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Zone d'upload */}
        {!showUpload ? (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setShowUpload(true)}
          >
            <FileText className="mr-2 h-4 w-4" />
            Ajouter un document PDF
          </Button>
        ) : (
          <div className="space-y-2">
            <DocumentUpload
              childId={childId}
              onUploadComplete={handleUploadComplete}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowUpload(false)}
              className="w-full"
            >
              Annuler
            </Button>
          </div>
        )}

        {/* Liste des documents */}
        {isLoadingDocs ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <ChildDocumentsTable
            childId={childId}
            documents={documents}
            canDelete={canDelete}
            onDeleteSuccess={() => {
              refetchDocuments();
              refetchCount();
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}
