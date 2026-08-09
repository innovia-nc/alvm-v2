'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc/client';
import { toast } from 'sonner';
import { FileText, Download, Loader2 } from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

type UserRole = 'PARENT' | 'STAFF' | 'ADMIN';

interface StaffDocument {
id: string;
originalFilename: string;
description: string | null;
fileUrl: string;
}

interface StaffDocumentsSectionProps {
staffId: string;
userRole: UserRole;
className?: string;
}

// ============================================================================
// COMPOSANT
// ============================================================================

export function StaffDocumentsSection({
staffId,
userRole,
className,
}: StaffDocumentsSectionProps) {
const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

// Requêtes tRPC
const {
    data: documents = [],
    isLoading: isLoadingDocs,
    refetch: refetchDocuments,
} = trpc.staffDocuments.list.useQuery({ staffId });

// US-PERS-02 : le compteur `staffDocuments.count` n'est plus affiché
// (« Documents PDF liés à ce personnel (0) »). La requête est retirée avec lui.

// Mutation pour la suppression
const deleteMutation = trpc.staffDocuments.delete.useMutation({
    onSuccess: async () => {
    toast.success('Document supprimé');
    await refetchDocuments();
    },
    onError: (err) => toast.error(err.message || 'Erreur lors de la suppression'),
});

const canDelete = userRole === 'STAFF' || userRole === 'ADMIN';

// Gestion de la génération PDF
async function handleGeneratePDF() {
    try {
    setIsGeneratingPDF(true);

    const response = await fetch(`/api/generate/staff-profile/${staffId}`);

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Erreur lors de la génération du PDF');
    }

    const blob = await response.blob();
    const contentDisposition = response.headers.get('Content-Disposition');
    const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
    const filename = filenameMatch?.[1] ?? 'fiche-staff.pdf';

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    toast.success('Fiche staff générée avec succès');
    } catch (e) {
    toast.error(e instanceof Error ? e.message : 'Erreur lors de la génération du PDF');
    } finally {
    setIsGeneratingPDF(false);
    }
}

return (
    <Card className={className}>
    <CardHeader>
        <div className="flex items-start justify-between">
        <div>
            <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Documents
            </CardTitle>
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
                Fiche staff (PDF)
                </>
            )}
            </Button>
        </div>
        </div>
    </CardHeader>

    {/* US-PERS-02 : fiche épurée — sans document, la carte se limite à son
        en-tête (titre + bouton de génération). Plus de libellé « Aucun
        document PDF pour ce personnel. ». */}
    {(isLoadingDocs || documents.length > 0) && (
    <CardContent>
        {isLoadingDocs ? (
        <div className="flex items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
        ) : (
        <div className="space-y-3">
            {documents.map((doc: StaffDocument) => (
            <div
                key={doc.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
            >
                <div className="min-w-0">
                <p className="truncate font-medium">{doc.originalFilename}</p>
                <p className="text-sm text-muted-foreground truncate">
                    {doc.description ?? 'Sans description'}
                </p>
                </div>

                <div className="flex items-center gap-2">
                <Button asChild variant="secondary" size="sm">
                    <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer">
                    Télécharger
                    </a>
                </Button>

                {canDelete && (
                    <Button
                    variant="destructive"
                    size="sm"
                    onClick={() =>
                        deleteMutation.mutate({ documentId: doc.id })
                    }
                    disabled={deleteMutation.isPending}
                    >
                    Supprimer
                    </Button>
                )}
                </div>
            </div>
            ))}
        </div>
        )}
    </CardContent>
    )}
    </Card>
);
}