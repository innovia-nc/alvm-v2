/**
 * Application automatique des avoirs sur la facture suivante (US-FACT-02).
 *
 * Règle métier
 * ------------
 * À l'ÉMISSION d'une facture (transition DRAFT → SENT), les crédits
 * disponibles du parent sont imputés du plus ancien au plus récent (FIFO)
 * jusqu'à couverture du montant dû ou épuisement des crédits. Un crédit
 * supérieur au reste dû n'est prélevé qu'à hauteur du nécessaire : le solde
 * demeure disponible pour une facture ultérieure.
 *
 * Pourquoi à l'émission et pas à la création du brouillon : un DRAFT reste
 * modifiable (lignes, montants). Imputer un avoir dessus obligerait à
 * dé-imputer à chaque modification. L'émission est le premier instant où le
 * montant dû est figé.
 *
 * Comptabilité
 * ------------
 * C'est le point qui avait bloqué FEAT-005 en juin 2026 : le chemin
 * `applyCredit` envisagé alors ne générait aucune écriture, ce qui aurait
 * produit un FEC faux. On ne crée donc PAS de schéma comptable ad hoc : on
 * réutilise le chemin déjà en production pour le règlement manuel par avoir,
 * à savoir un `Payment` porté par la méthode de règlement `CREDIT_NOTE`.
 * `createPaymentEntries` en dérive l'écriture BQ D 4191 / C 411000, exactement
 * équilibrée avec le C 4191 posé à l'émission de l'avoir. Aucune écriture
 * nouvelle n'est inventée, aucun compte nouveau n'est mobilisé.
 *
 * Traçabilité
 * -----------
 * Chaque imputation écrit trois enregistrements :
 *  - `CreditApplication`      — historique métier (montant, date, facture) ;
 *  - `CreditNoteAllocation`   — cohérence avec le calcul de solde du chemin
 *                               manuel (`payments.create`), qui agrège ce
 *                               modèle pour interdire une double consommation ;
 *  - `Payment`                — trace comptable et affichage sur le PDF.
 * `ParentCredit.amountRemaining` est décrémenté d'autant.
 */

import { TRPCError } from '@trpc/server';
import { toNum } from '@/server/helpers/decimal';
import { generateDocumentNumber } from '@/server/helpers/invoice-number';
import { createPaymentEntries } from '@/server/services/accounting.service';

/**
 * Transaction client type — compatible avec PrismaClient et les clients
 * étendus (extension soft-delete, callback $transaction).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TxClient = any;

export interface RestoreCreditParams {
  /** Avoir dont provenait le règlement supprimé. */
  creditNoteId: string;
  /** Facture sur laquelle il avait été imputé. */
  invoiceId: string;
  /** Montant du règlement supprimé. */
  amount: number;
}

/**
 * Restitue un crédit après suppression d'un règlement par avoir (TD-003).
 *
 * Symétrique exact de l'imputation : l'allocation est decrementee ou supprimee,
 * la ligne d'historique correspondante est retiree, et `amountRemaining` est
 * recredite — plafonne au montant initial pour qu'une double suppression ne
 * puisse pas gonfler l'avoir au-dela de sa valeur.
 *
 * A appeler DANS la transaction de suppression, AVANT de supprimer le paiement
 * (les identifiants sont lus depuis celui-ci).
 */
export async function restoreCreditOnPaymentDeletion(
  tx: TxClient,
  params: RestoreCreditParams
): Promise<void> {
  const { creditNoteId, invoiceId, amount } = params;

  if (amount <= 0) return;

  // 1. Allocation — vue « solde » du chemin manuel.
  const allocation = await tx.creditNoteAllocation.findFirst({
    where: { creditNoteId, appliedToInvoiceId: invoiceId },
  });

  if (allocation) {
    const allocated = toNum(allocation.amount);

    if (allocated > amount) {
      // Plusieurs reglements sur la meme facture : on ne retire que la part
      // du reglement supprime.
      await tx.creditNoteAllocation.update({
        where: { id: allocation.id },
        data: { amount: allocated - amount },
      });
    } else {
      await tx.creditNoteAllocation.delete({ where: { id: allocation.id } });
    }
  }

  // 2. Credit parent — vue « solde » du chemin automatique.
  const parentCredit = await tx.parentCredit.findFirst({ where: { creditNoteId } });
  if (!parentCredit) return;

  const original = toNum(parentCredit.amountOriginal);
  const remaining = toNum(parentCredit.amountRemaining);

  await tx.parentCredit.update({
    where: { id: parentCredit.id },
    data: { amountRemaining: Math.min(original, remaining + amount) },
  });

  // 3. Historique — retirer la ligne correspondant au reglement supprime.
  const application = await tx.creditApplication.findFirst({
    where: { parentCreditId: parentCredit.id, invoiceId, amountUsed: amount },
    orderBy: { appliedAt: 'desc' },
  });

  if (application) {
    await tx.creditApplication.delete({ where: { id: application.id } });
  }
}

export interface ApplyCreditsParams {
  invoiceId: string;
  invoiceNumber: string;
  parentId: string;
  /** Montant TTC de la facture. */
  totalAmount: number;
  /** Montant déjà réglé sur cette facture (0 à l'émission, sauf cas limite). */
  paidAmount: number;
  /** Utilisateur à l'origine de l'émission (traçabilité `appliedBy`). */
  userId: string;
  /** Date de référence pour l'expiration des crédits. */
  now?: Date;
}

export interface AppliedCredit {
  parentCreditId: string;
  creditNoteId: string;
  creditNoteNumber: string;
  amountUsed: number;
  /** Solde du crédit APRÈS imputation. */
  amountRemaining: number;
}

export interface ApplyCreditsResult {
  /** Imputations réalisées, dans l'ordre FIFO. */
  applied: AppliedCredit[];
  /** Total imputé sur la facture. */
  totalApplied: number;
  /** Reste dû après imputation. */
  remainingDue: number;
}

/**
 * Impute les crédits disponibles d'un parent sur une facture, en FIFO.
 *
 * À appeler DANS une transaction, après la création des écritures VE de la
 * facture. Ne modifie pas le statut de la facture : l'appelant décide (voir
 * `invoices.validate`, qui bascule en PAID si le solde tombe à zéro).
 *
 * @returns le détail des imputations et le reste dû.
 */
export async function applyAvailableCreditsToInvoice(
  tx: TxClient,
  params: ApplyCreditsParams
): Promise<ApplyCreditsResult> {
  const { invoiceId, invoiceNumber, parentId, totalAmount, paidAmount, userId } = params;
  const now = params.now ?? new Date();

  let remainingDue = totalAmount - paidAmount;
  const applied: AppliedCredit[] = [];

  // Rien à imputer : facture déjà soldée ou à montant nul (les factures à
  // 0 XPF existent — cf. exonération TGC et lignes offertes).
  if (remainingDue <= 0) {
    return { applied, totalApplied: 0, remainingDue: Math.max(0, remainingDue) };
  }

  // FIFO : le crédit le plus ancien d'abord. Les crédits expirés sont ignorés.
  const credits = await tx.parentCredit.findMany({
    where: {
      parentId,
      amountRemaining: { gt: 0 },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    orderBy: { createdAt: 'asc' },
    include: {
      creditNote: { select: { id: true, invoiceNumber: true, status: true, isFutureCredit: true } },
    },
  });

  const usable = credits.filter(
    (credit: { creditNote: { status: string } | null }) =>
      // Un avoir annulé ne doit plus rien financer, même si le crédit associé
      // n'a pas été purgé.
      credit.creditNote != null && credit.creditNote.status !== 'CANCELLED'
  );

  if (usable.length === 0) {
    return { applied, totalApplied: 0, remainingDue };
  }

  // La méthode de règlement « Avoir » porte le code comptable du chemin
  // manuel. Son absence signifie que le seed système n'a pas été appliqué :
  // on échoue explicitement plutôt que d'émettre une facture en ignorant
  // silencieusement des crédits dus au parent.
  const creditNoteMethod = await tx.paymentMethod.findFirst({
    where: { code: 'CREDIT_NOTE' },
    select: { id: true, code: true, accountingCode: true },
  });

  if (!creditNoteMethod) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message:
        "Méthode de règlement « Avoir » (CREDIT_NOTE) introuvable : impossible d'imputer " +
        'les avoirs disponibles du client. Appliquer le seed des méthodes de règlement.',
    });
  }

  let totalApplied = 0;

  for (const credit of usable) {
    if (remainingDue <= 0) break;

    const available = toNum(credit.amountRemaining);
    if (available <= 0) continue;

    // Imputation partielle : on ne prélève que le nécessaire, le solde reste
    // disponible pour une facture ultérieure.
    const amountUsed = Math.min(available, remainingDue);

    const paymentNumber = await generateDocumentNumber(tx, 'PAYMENT');
    const payment = await tx.payment.create({
      data: {
        paymentNumber,
        invoiceId,
        amount: amountUsed,
        paymentDate: now,
        paymentMethodId: creditNoteMethod.id,
        creditNoteId: credit.creditNoteId,
        notes: `Imputation automatique de l'avoir ${credit.creditNote.invoiceNumber}`,
        recordedBy: userId,
      },
    });

    // Historique métier consultable depuis la fiche de l'avoir.
    await tx.creditApplication.create({
      data: {
        parentCreditId: credit.id,
        invoiceId,
        amountUsed,
        appliedAt: now,
        appliedBy: userId,
        notes: `Déduction automatique sur la facture ${invoiceNumber}`,
      },
    });

    // Miroir du chemin manuel : `payments.create` agrège ce modèle pour
    // calculer le solde disponible d'un avoir. Sans cette ligne, un avoir
    // imputé automatiquement resterait consommable une seconde fois à la main.
    await tx.creditNoteAllocation.create({
      data: {
        creditNoteId: credit.creditNoteId,
        appliedToInvoiceId: invoiceId,
        amount: amountUsed,
        notes: `Imputation automatique — facture ${invoiceNumber}`,
        recordedBy: userId,
      },
    });

    const amountRemaining = available - amountUsed;
    await tx.parentCredit.update({
      where: { id: credit.id },
      data: { amountRemaining },
    });

    // Écriture BQ : D 4191 / C 411000 — contrepartie exacte du C 4191 posé
    // lors de l'émission de l'avoir.
    await createPaymentEntries(tx, {
      paymentId: payment.id,
      invoiceId,
      parentId,
      amount: amountUsed,
      paymentDate: now,
      paymentMethodCode: creditNoteMethod.code,
      paymentMethodAccountingCode: creditNoteMethod.accountingCode ?? '411000',
      invoiceNumber,
      creditNoteIsFutureCredit: true,
      userId,
    });

    applied.push({
      parentCreditId: credit.id,
      creditNoteId: credit.creditNoteId,
      creditNoteNumber: credit.creditNote.invoiceNumber,
      amountUsed,
      amountRemaining,
    });

    totalApplied += amountUsed;
    remainingDue -= amountUsed;
  }

  return { applied, totalApplied, remainingDue };
}
