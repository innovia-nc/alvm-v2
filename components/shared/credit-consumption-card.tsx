/**
 * Historique de consommation d'un avoir (US-FACT-02).
 *
 * Affiché sur la fiche détail d'un avoir, côté admin comme côté staff : montant
 * initial, solde restant, expiration éventuelle, et une ligne par imputation
 * (date, facture, montant) — y compris les déductions automatiques réalisées à
 * l'émission d'une facture.
 *
 * Ne s'affiche que pour les avoirs ouvrant un crédit futur : un avoir remboursé
 * immédiatement (IMMEDIATE_REFUND) n'ouvre aucun crédit, donc aucun historique.
 */

import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface CreditApplicationRow {
  id: string;
  amountUsed: number;
  appliedAt: Date;
  invoiceId: string | null;
  invoiceNumber: string | null;
}

interface CreditConsumptionCardProps {
  /** Solde encore disponible. `null` si l'avoir n'ouvre pas de crédit futur. */
  availableCredit: number | null;
  /** Montant initial du crédit. */
  creditOriginalAmount: number | null;
  /** Date d'expiration du crédit, si paramétrée. */
  creditExpiresAt: Date | null;
  /** Imputations, de la plus ancienne à la plus récente. */
  creditApplications: CreditApplicationRow[];
  /** Racine des liens vers les factures (`/dashboard/admin/invoices`, …). */
  invoiceBasePath: string;
}

function formatXpf(amount: number): string {
  return `${amount.toLocaleString('fr-FR')} XPF`;
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('fr-FR');
}

export function CreditConsumptionCard({
  availableCredit,
  creditOriginalAmount,
  creditExpiresAt,
  creditApplications,
  invoiceBasePath,
}: CreditConsumptionCardProps) {
  // Pas de crédit ouvert (avoir remboursé immédiatement, ou avoir encore en
  // brouillon) : rien à tracer.
  if (availableCredit === null || creditOriginalAmount === null) return null;

  const consumed = creditOriginalAmount - availableCredit;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Utilisation du crédit</CardTitle>
        <CardDescription>
          Historique des déductions de cet avoir sur les factures du client.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <div className="text-sm text-muted-foreground">Montant initial</div>
            <div className="font-medium">{formatXpf(creditOriginalAmount)}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Déjà utilisé</div>
            <div className="font-medium">{formatXpf(consumed)}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Solde restant</div>
            <div className="text-lg font-semibold">{formatXpf(availableCredit)}</div>
          </div>
        </div>

        {creditExpiresAt && (
          <p className="text-sm text-muted-foreground">
            Crédit utilisable jusqu&apos;au {formatDate(creditExpiresAt)}.
          </p>
        )}

        {creditApplications.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ce crédit n&apos;a encore été imputé sur aucune facture. Il sera déduit
            automatiquement de la prochaine facture émise pour ce client.
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Facture</TableHead>
                  <TableHead className="text-right">Montant imputé</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {creditApplications.map((application) => (
                  <TableRow key={application.id}>
                    <TableCell>{formatDate(application.appliedAt)}</TableCell>
                    <TableCell>
                      {application.invoiceId && application.invoiceNumber ? (
                        <Link
                          href={`${invoiceBasePath}/${application.invoiceId}`}
                          className="font-medium text-blue-600 hover:underline"
                        >
                          {application.invoiceNumber}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">Facture supprimée</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatXpf(application.amountUsed)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
