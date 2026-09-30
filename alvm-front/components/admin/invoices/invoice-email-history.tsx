'use client';

import { trpc } from '@/lib/trpc/client';
import { BUSINESS_LOCALE, BUSINESS_TIME_ZONE } from '@/lib/format';
import { StatusBadge } from '@/components/shared/status-badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const formatDateTime = (value: Date) =>
  new Date(value).toLocaleString(BUSINESS_LOCALE, {
    timeZone: BUSINESS_TIME_ZONE,
    dateStyle: 'short',
    timeStyle: 'short',
  });

/** Tant qu'un envoi est programmé, le statut est rafraîchi. */
const POLL_WHILE_QUEUED_MS = 5_000;

/**
 * Historique des envois par email d'une facture (file `alvm-email`).
 *
 * Rendu seulement si le module email de l'association est actif : la
 * procédure est gardée par ce module (FORBIDDEN sinon).
 */
export function InvoiceEmailHistory({ invoiceId }: { invoiceId: string }) {
  const features = trpc.features.get.useQuery();
  const emailEnabled = features.data?.email === true;
  const history = trpc.invoices.emailHistory.useQuery(
    { id: invoiceId },
    {
      enabled: emailEnabled,
      refetchInterval: (query) =>
        query.state.data?.some((message) => message.status === 'QUEUED')
          ? POLL_WHILE_QUEUED_MS
          : false,
    },
  );

  if (!emailEnabled || !history.data?.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Envois par email</CardTitle>
        <CardDescription>
          Les envois sont programmés puis traités en arrière-plan (3 tentatives).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Programmé le</TableHead>
              <TableHead>Destinataire</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Détail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.data.map((message) => (
              <TableRow key={message.id}>
                <TableCell>{formatDateTime(message.createdAt)}</TableCell>
                <TableCell>{message.recipient}</TableCell>
                <TableCell>
                  <StatusBadge type="email" status={message.status} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {message.status === 'SENT' && message.sentAt
                    ? `Envoyé le ${formatDateTime(message.sentAt)}`
                    : message.lastError
                      ? `${message.lastError} (tentative${message.attempts > 1 ? 's' : ''} : ${message.attempts})`
                      : 'En attente d’envoi'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
