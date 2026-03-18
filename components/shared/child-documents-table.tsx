/**
 * Child Documents Table Component
 *
 * Table affichant les documents PDF uploadés pour un enfant.
 * Supporte le téléchargement et la suppression (selon permissions).
 */

'use client';

import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { FileText, Download, Trash2, MoreHorizontal, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

interface ChildDocument {
  id: string;
  filename: string;
  originalFilename: string;
  fileUrl: string;
  fileSize: number;
  description: string | null;
  uploadedBy: string;
  createdAt: Date;
}

interface ChildDocumentsTableProps {
  /**
   * ID de l'enfant
   */
  childId: string;

  /**
   * Liste des documents
   */
  documents: ChildDocument[];

  /**
   * Peut supprimer des documents
   */
  canDelete?: boolean;

  /**
   * Callback après suppression réussie
   */
  onDeleteSuccess?: () => void;

  /**
   * Classe CSS additionnelle
   */
  className?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function ChildDocumentsTable({
  childId,
  documents,
  canDelete = false,
  onDeleteSuccess,
  className,
}: ChildDocumentsTableProps) {
  const [documentToDelete, setDocumentToDelete] = useState<string | null>(null);

  const utils = trpc.useUtils();

  // --------------------------------------------------------------------------
  // MUTATIONS
  // --------------------------------------------------------------------------

  const deleteMutation = trpc.childDocuments.delete.useMutation({
    onSuccess: () => {
      toast.success('Document supprimé avec succès');
      // Invalider le cache pour refresh la liste
      utils.childDocuments.list.invalidate({ childId });
      utils.childDocuments.count.invalidate({ childId });
      onDeleteSuccess?.();
      setDocumentToDelete(null);
    },
    onError: (error) => {
      toast.error('Erreur lors de la suppression', {
        description: error.message,
      });
    },
  });

  // --------------------------------------------------------------------------
  // HANDLERS
  // --------------------------------------------------------------------------

  const handleDownload = (doc: ChildDocument) => {
    // Ouvrir dans un nouvel onglet pour téléchargement
    window.open(doc.fileUrl, '_blank');
  };

  const handleDelete = (documentId: string) => {
    setDocumentToDelete(documentId);
  };

  const confirmDelete = () => {
    if (documentToDelete) {
      deleteMutation.mutate({ documentId: documentToDelete });
    }
  };

  // --------------------------------------------------------------------------
  // HELPERS
  // --------------------------------------------------------------------------

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (date: Date): string => {
    return new Date(date).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  // --------------------------------------------------------------------------
  // RENDER
  // --------------------------------------------------------------------------

  if (documents.length === 0) {
    return (
      <div className={cn('rounded-lg border border-dashed border-gray-300 p-8', className)}>
        <div className="flex flex-col items-center justify-center text-center">
          <FileText className="h-12 w-12 text-gray-400 mb-3" />
          <h3 className="text-sm font-medium text-gray-900 mb-1">
            Aucun document
          </h3>
          <p className="text-sm text-gray-500">
            Les documents PDF uploadés apparaîtront ici.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={cn('rounded-md border', className)}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]"></TableHead>
              <TableHead>Nom du fichier</TableHead>
              <TableHead>Taille</TableHead>
              <TableHead>Date d'ajout</TableHead>
              <TableHead className="w-[80px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.map((doc) => (
              <TableRow key={doc.id}>
                {/* Icon */}
                <TableCell>
                  <FileText className="h-5 w-5 text-red-600" />
                </TableCell>

                {/* Filename + Description */}
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium text-sm">
                      {doc.originalFilename}
                    </span>
                    {doc.description && (
                      <span className="text-xs text-gray-500">
                        {doc.description}
                      </span>
                    )}
                  </div>
                </TableCell>

                {/* File Size */}
                <TableCell className="text-sm text-gray-600">
                  {formatFileSize(doc.fileSize)}
                </TableCell>

                {/* Date */}
                <TableCell className="text-sm text-gray-600">
                  {formatDate(doc.createdAt)}
                </TableCell>

                {/* Actions */}
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleDownload(doc)}>
                        <Download className="mr-2 h-4 w-4" />
                        Télécharger
                      </DropdownMenuItem>
                      {canDelete && (
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => handleDelete(doc.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Supprimer
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Alert Dialog pour confirmation suppression */}
      <AlertDialog
        open={!!documentToDelete}
        onOpenChange={(open) => !open && setDocumentToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer ce document ? Cette action est
              irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Suppression...
                </>
              ) : (
                'Supprimer'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
