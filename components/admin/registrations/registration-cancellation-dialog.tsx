'use client';

import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc/client';
import type { AdminRegistrationType } from './columns';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface RegistrationCancellationDialogProps {
  registration: AdminRegistrationType | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

type RefundChoice = 'IMMEDIATE_REFUND' | 'FUTURE_CREDIT';
type RefundMethod = 'CASH' | 'CHECK' | 'BANK_TRANSFER';

export function RegistrationCancellationDialog({
  registration,
  open,
  onOpenChange,
  onSuccess,
}: RegistrationCancellationDialogProps) {
  const [step, setStep] = useState(1);
  const [reason, setReason] = useState('');
  const [refundChoice, setRefundChoice] = useState<RefundChoice>('IMMEDIATE_REFUND');
  const [refundMethod, setRefundMethod] = useState<RefundMethod>('BANK_TRANSFER');
  const [error, setError] = useState<string | null>(null);
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(true);

  // Query pour analyser la situation
  const { data: analysisResult, isLoading: isLoadingAnalysis } = trpc.registrations.analyzeRegistrationStatus.useQuery(
    { registrationId: registration?.id || '' },
    {
      enabled: !!registration?.id && open,
    }
  );

  // Effet pour mettre à jour l'état d'analyse
  useEffect(() => {
    if (analysisResult) {
      setAnalysisData(analysisResult);
      setIsAnalyzing(false);
    }
  }, [analysisResult]);

  // Effet pour gérer le chargement initial
  useEffect(() => {
    if (!isLoadingAnalysis && registration?.id && open) {
      setIsAnalyzing(false);
    }
  }, [isLoadingAnalysis, registration?.id, open]);

  const cancelMutation = trpc.registrations.cancelWithAccounting.useMutation({
    onSuccess: () => {
      resetDialog();
      onSuccess();
      onOpenChange(false);
    },
    onError: (err) => {
      setError(err.message || 'Erreur lors de l\'annulation');
    },
  });

  // Reset dialog quand il se ferme
  useEffect(() => {
    if (!open) {
      resetDialog();
    }
  }, [open]);

  // Reset quand l'inscription change
  useEffect(() => {
    if (registration?.id) {
      resetDialog();
      setIsAnalyzing(true);
    }
  }, [registration?.id]);

  function resetDialog() {
    setStep(1);
    setReason('');
    setRefundChoice('IMMEDIATE_REFUND');
    setRefundMethod('BANK_TRANSFER');
    setError(null);
    setAnalysisData(null);
  }

  if (!registration) return null;

  // Calcul dynamique du nombre total d'étapes
  function getTotalSteps() {
    if (!analysisData) return 2;

    switch (analysisData.suggestedCase) {
      case 'NO_INVOICE':
      case 'DRAFT_INVOICE':
      case 'SENT_UNPAID':
        return 2; // Motif + Confirmation
      case 'PARTIALLY_PAID':
        return 3; // Motif + Choix remboursement/crédit + Confirmation
      case 'FULLY_PAID':
        return refundChoice === 'IMMEDIATE_REFUND' ? 4 : 3; // +1 pour méthode si remboursement
      default:
        return 2;
    }
  }

  function getStepTitle() {
    const totalSteps = getTotalSteps();

    if (step === 1) {
      return `Étape 1/${totalSteps} : Motif de l'annulation`;
    }

    if (analysisData?.requiresRefundChoice && step === 2) {
      return `Étape 2/${totalSteps} : Type de compensation`;
    }

    if (analysisData?.requiresPaymentMethod && refundChoice === 'IMMEDIATE_REFUND' && step === 3) {
      return `Étape 3/${totalSteps} : Méthode de remboursement`;
    }

    return `Étape ${step}/${totalSteps} : Récapitulatif`;
  }

  function handleNext() {
    setError(null);

    // Validation du motif
    if (step === 1) {
      if (reason.trim().length < 10) {
        setError('Le motif doit contenir au moins 10 caractères');
        return;
      }

      // Si pas de choix requis, aller directement au récap
      if (!analysisData?.requiresRefundChoice) {
        setStep(getTotalSteps()); // Aller au récap
        return;
      }

      setStep(2);
      return;
    }

    // Étape choix remboursement/crédit
    if (step === 2 && analysisData?.requiresRefundChoice) {
      // Si crédit futur ou pas de méthode requise, aller au récap
      if (refundChoice === 'FUTURE_CREDIT' || !analysisData.requiresPaymentMethod) {
        setStep(getTotalSteps()); // Aller au récap
        return;
      }

      setStep(3); // Aller à la méthode
      return;
    }

    // Étape méthode de remboursement
    if (step === 3 && analysisData?.requiresPaymentMethod && refundChoice === 'IMMEDIATE_REFUND') {
      setStep(getTotalSteps()); // Aller au récap
      return;
    }

    // Étape finale : soumettre
    if (step === getTotalSteps()) {
      handleSubmit();
    }
  }

  function handleBack() {
    setError(null);

    const totalSteps = getTotalSteps();

    // Du récap, revenir à l'étape précédente appropriée
    if (step === totalSteps) {
      if (analysisData?.requiresPaymentMethod && refundChoice === 'IMMEDIATE_REFUND') {
        setStep(3); // Revenir à la méthode
      } else if (analysisData?.requiresRefundChoice) {
        setStep(2); // Revenir au choix
      } else {
        setStep(1); // Revenir au motif
      }
      return;
    }

    // Navigation normale
    setStep(Math.max(1, step - 1));
  }

  function handleSubmit() {
    if (!registration) return;

    const params: any = {
      registrationId: registration.id,
      reason: reason.trim(),
    };

    // Ajouter les paramètres selon le cas
    if (analysisData?.requiresRefundChoice) {
      params.refundChoice = refundChoice;
    }

    cancelMutation.mutate(params);
  }

  const isLastStep = step === getTotalSteps();
  const canGoNext = step === 1 ? reason.trim().length >= 10 : true;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>
            Annulation de l&apos;inscription
          </AlertDialogTitle>
          <AlertDialogDescription>
            Enfant : <strong>{registration.child.firstName} {registration.child.lastName}</strong>
            {' • '}
            Camp : <strong>{registration.camp.name}</strong>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {isAnalyzing ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              <span>Analyse de la situation comptable...</span>
            </div>
          ) : analysisData ? (
            <>
              {/* Étape 1 : Motif */}
              {step === 1 && (
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">{getStepTitle()}</h3>

                  {/* Info sur la situation */}
                  <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">Situation :</span>
                      <span className="text-sm">
                        {analysisData.hasInvoice ? (
                          <>
                            Facture {analysisData.invoiceStatus}
                            {analysisData.paidAmount > 0 && (
                              <> • {analysisData.paidAmount.toLocaleString('fr-FR')} XPF payés</>
                            )}
                          </>
                        ) : (
                          'Pas de facture'
                        )}
                      </span>
                    </div>
                    {analysisData.hasInvoice && (
                      <div className="flex justify-between">
                        <span className="text-sm font-medium">Montant total :</span>
                        <span className="text-sm">{analysisData.totalAmount.toLocaleString('fr-FR')} XPF</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="reason">Motif de l'annulation (minimum 10 caractères)</Label>
                    <Textarea
                      id="reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Ex: Annulation demandée par le parent pour raisons familiales..."
                      rows={4}
                      className="resize-none"
                    />
                    <p className="text-sm text-muted-foreground">
                      {reason.trim().length} / 10 caractères minimum
                    </p>
                  </div>
                </div>
              )}

              {/* Étape 2 : Choix remboursement/crédit (si nécessaire) */}
              {step === 2 && analysisData.requiresRefundChoice && (
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">{getStepTitle()}</h3>

                  <div className="space-y-3">
                    <label
                      className={`flex items-start space-x-3 border rounded-lg p-4 cursor-pointer transition-colors ${
                        refundChoice === 'IMMEDIATE_REFUND' ? 'bg-primary/5 border-primary' : 'hover:bg-muted/50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="refundChoice"
                        value="IMMEDIATE_REFUND"
                        checked={refundChoice === 'IMMEDIATE_REFUND'}
                        onChange={(e) => setRefundChoice(e.target.value as RefundChoice)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="font-semibold">Remboursement immédiat</div>
                        <div className="text-sm text-muted-foreground mt-1">
                          Un avoir sera créé et le montant sera remboursé au parent via la méthode choisie.
                          {analysisData.suggestedCase === 'PARTIALLY_PAID' && (
                            <div className="mt-1 font-medium text-orange-600">
                              Montant à rembourser : {analysisData.paidAmount.toLocaleString('fr-FR')} XPF
                            </div>
                          )}
                        </div>
                      </div>
                    </label>

                    <label
                      className={`flex items-start space-x-3 border rounded-lg p-4 cursor-pointer transition-colors ${
                        refundChoice === 'FUTURE_CREDIT' ? 'bg-primary/5 border-primary' : 'hover:bg-muted/50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="refundChoice"
                        value="FUTURE_CREDIT"
                        checked={refundChoice === 'FUTURE_CREDIT'}
                        onChange={(e) => setRefundChoice(e.target.value as RefundChoice)}
                        className="mt-1"
                      />
                      <div className="flex-1">
                        <div className="font-semibold">Crédit pour future inscription</div>
                        <div className="text-sm text-muted-foreground mt-1">
                          Un avoir sera créé et restera disponible pour une future inscription.
                          {analysisData.suggestedCase === 'FULLY_PAID' && (
                            <div className="mt-1 font-medium text-green-600">
                              Crédit disponible : {analysisData.paidAmount.toLocaleString('fr-FR')} XPF
                            </div>
                          )}
                        </div>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {/* Étape 3 : Méthode de remboursement (si nécessaire) */}
              {step === 3 && analysisData.requiresPaymentMethod && refundChoice === 'IMMEDIATE_REFUND' && (
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">{getStepTitle()}</h3>

                  <div className="space-y-2">
                    <Label htmlFor="refund-method">Méthode de remboursement</Label>
                    <Select value={refundMethod} onValueChange={(v) => setRefundMethod(v as RefundMethod)}>
                      <SelectTrigger id="refund-method">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BANK_TRANSFER">Virement bancaire</SelectItem>
                        <SelectItem value="CHECK">Chèque</SelectItem>
                        <SelectItem value="CASH">Espèces</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Le remboursement devra être effectué manuellement selon la méthode choisie.
                      Un remboursement sera enregistré dans le système.
                    </AlertDescription>
                  </Alert>
                </div>
              )}

              {/* Récapitulatif final */}
              {step === getTotalSteps() && (
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">{getStepTitle()}</h3>

                  <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                    <div>
                      <div className="text-sm font-medium text-muted-foreground">Motif :</div>
                      <div className="text-sm mt-1">{reason}</div>
                    </div>

                    <div className="border-t pt-3">
                      <div className="text-sm font-medium text-muted-foreground">Opérations comptables :</div>
                      <ul className="text-sm mt-2 space-y-1 list-disc list-inside">
                        {analysisData.suggestedCase === 'NO_INVOICE' && (
                          <li>Annulation simple de l'inscription (pas d'impact comptable)</li>
                        )}
                        {analysisData.suggestedCase === 'DRAFT_INVOICE' && (
                          <li>Suppression de la facture brouillon</li>
                        )}
                        {analysisData.suggestedCase === 'SENT_UNPAID' && (
                          <li>Annulation de la facture et des écritures comptables</li>
                        )}
                        {(analysisData.suggestedCase === 'PARTIALLY_PAID' || analysisData.suggestedCase === 'FULLY_PAID') && (
                          <>
                            <li>Création d'un avoir de {analysisData.totalAmount.toLocaleString('fr-FR')} XPF</li>
                            {refundChoice === 'IMMEDIATE_REFUND' ? (
                              <>
                                <li>Création d'un remboursement de {
                                  (analysisData.suggestedCase === 'PARTIALLY_PAID'
                                    ? analysisData.paidAmount
                                    : analysisData.totalAmount
                                  ).toLocaleString('fr-FR')} XPF</li>
                                <li>Méthode : {
                                  refundMethod === 'BANK_TRANSFER' ? 'Virement bancaire' :
                                  refundMethod === 'CHECK' ? 'Chèque' : 'Espèces'
                                }</li>
                              </>
                            ) : (
                              <li>L'avoir restera disponible pour une utilisation future</li>
                            )}
                          </>
                        )}
                      </ul>
                    </div>

                    <div className="border-t pt-3">
                      <div className="text-sm font-medium text-muted-foreground">Inscription :</div>
                      <div className="text-sm mt-1">Le statut passera de "Confirmée" à "Annulée"</div>
                    </div>
                  </div>

                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      Cette action est irréversible. Veuillez confirmer l'annulation.
                    </AlertDescription>
                  </Alert>
                </div>
              )}
            </>
          ) : null}
        </div>

        <AlertDialogFooter className="gap-2">
          {step > 1 && !isAnalyzing && (
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={cancelMutation.isPending}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Retour
            </Button>
          )}

          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={cancelMutation.isPending || isAnalyzing}
          >
            Annuler
          </Button>

          {!isAnalyzing && analysisData && (
            <Button
              onClick={handleNext}
              disabled={!canGoNext || cancelMutation.isPending}
              className={isLastStep ? 'bg-orange-600 hover:bg-orange-700' : ''}
            >
              {cancelMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Annulation en cours...
                </>
              ) : isLastStep ? (
                'Confirmer l\'annulation'
              ) : (
                <>
                  Suivant
                  <ChevronRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}