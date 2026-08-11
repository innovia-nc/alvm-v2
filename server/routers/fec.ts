import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, adminProcedure } from '@/server/trpc/init';
import type { Prisma } from '@prisma/client';
import { toNum } from '@/server/helpers/decimal';
import { getFecSiren, normalizeSiren } from '@/server/helpers/settings';

// ============================================================================
// SCHEMAS
// ============================================================================

const accountingEntrySchema = z.object({
  id: z.string().uuid(),
  entryNum: z.string().nullable(),
  entryDate: z.date(),
  journalCode: z.string(),
  journalLib: z.string(),
  accountNumber: z.string(),
  accountLabel: z.string(),
  pieceRef: z.string(),
  pieceDate: z.date(),
  description: z.string(),
  debit: z.number(),
  credit: z.number(),
  invoiceId: z.string().uuid().nullable(),
  paymentId: z.string().uuid().nullable(),
  creditNoteId: z.string().uuid().nullable(),
  refundId: z.string().uuid().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// ============================================================================
// HELPERS
// ============================================================================

function generateFECContent(entries: any[]): string {
  const headers = [
    'JournalCode',
    'JournalLib',
    'EcritureNum',
    'EcritureDate',
    'CompteNum',
    'CompteLib',
    'CompAuxNum',
    'CompAuxLib',
    'PieceRef',
    'PieceDate',
    'EcritureLib',
    'Debit',
    'Credit',
    'EcritureLet',
    'DateLet',
    'ValidDate',
    'Montantdevise',
    'Idevise',
  ];

  let content = headers.join('|') + '\n';

  for (const entry of entries) {
    const entryDate = new Date(entry.entryDate);
    const pieceDate = new Date(entry.pieceDate);
    const validDate = entry.validDate ? new Date(entry.validDate) : entryDate;

    const row = [
      entry.journalCode,
      entry.journalLib,
      entry.entryNum || '',
      entryDate.toISOString().split('T')[0]!.replace(/-/g, ''),
      entry.accountNumber,
      entry.accountLabel,
      entry.compteAuxNum || '',
      entry.compteAuxLib || '',
      entry.pieceRef,
      pieceDate.toISOString().split('T')[0]!.replace(/-/g, ''),
      entry.description,
      entry.debit.toFixed(2).replace('.', ','),
      entry.credit.toFixed(2).replace('.', ','),
      entry.ecritureLet || '',
      entry.dateLet
        ? new Date(entry.dateLet).toISOString().split('T')[0]?.replace(/-/g, '') ?? ''
        : '',
      validDate.toISOString().split('T')[0]!.replace(/-/g, ''),
      entry.montantDevise ? entry.montantDevise.toFixed(2).replace('.', ',') : '',
      entry.idDevise || '',
    ];
    content += row.join('|') + '\n';
  }

  return content;
}

/**
 * Nom du fichier FEC.
 *
 * Article A47 A-1 du LPF : `SIRENFECAAAAMMJJ.txt`, où AAAAMMJJ est la date de
 * clôture de l'exercice — ici la date de fin de la période exportée.
 *
 * Sans SIREN, on retombe sur le nom historique `FEC_debut_fin.txt` : le fichier
 * reste exploitable par un logiciel comptable, mais il n'est pas conforme au
 * nommage attendu par l'administration. Le router le signale via `siren: null`.
 */
function buildFECFilename(
  siren: string | null,
  startDate: string,
  endDate: string,
): string {
  const fileEndDate = endDate.replace(/-/g, '');
  if (siren) return `${siren}FEC${fileEndDate}.txt`;
  return `FEC_${startDate.replace(/-/g, '')}_${fileEndDate}.txt`;
}

function mapEntry(e: any) {
  return {
    id: e.id,
    entryNum: e.entryNum,
    entryDate: e.entryDate,
    journalCode: e.journalCode,
    journalLib: e.journalLib,
    accountNumber: e.accountNumber,
    accountLabel: e.accountLabel,
    pieceRef: e.pieceRef,
    pieceDate: e.pieceDate,
    description: e.description,
    debit: toNum(e.debit),
    credit: toNum(e.credit),
    invoiceId: e.invoiceId,
    paymentId: e.paymentId,
    creditNoteId: e.creditNoteId,
    refundId: e.refundId,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

// ============================================================================
// ROUTER
// ============================================================================

export const fecRouter = router({
  getEntries: adminProcedure
    .input(z.object({
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format date invalide (YYYY-MM-DD)'),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format date invalide (YYYY-MM-DD)'),
      journalCode: z.string().optional(),
    }))
    .output(z.array(accountingEntrySchema))
    .query(async ({ ctx, input }) => {
      const where: Prisma.AccountingEntryWhereInput = {
        entryDate: {
          gte: new Date(input.startDate),
          lte: new Date(input.endDate),
        },
        isCancelled: false,
      };

      if (input.journalCode) {
        where.journalCode = input.journalCode;
      }

      const entries = await ctx.prisma.accountingEntry.findMany({
        where,
        orderBy: [
          { entryDate: 'asc' },
          { journalCode: 'asc' },
          { accountNumber: 'asc' },
        ],
      });

      return entries.map(mapEntry);
    }),

  generateFEC: adminProcedure
    .input(z.object({
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format date invalide (YYYY-MM-DD)'),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format date invalide (YYYY-MM-DD)'),
      // SIREN de l'exportateur : sert UNIQUEMENT au nom du fichier (A47 A-1).
      // Vide ou absent → on prend celui des settings (accounting.fec_siren).
      siren: z.string().optional(),
    }))
    .output(z.object({
      content: z.string(),
      filename: z.string(),
      /** SIREN effectivement utilisé pour nommer le fichier, `null` si aucun. */
      siren: z.string().nullable(),
      entryCount: z.number(),
      totalDebit: z.number(),
      totalCredit: z.number(),
      balance: z.number(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Un SIREN saisi mais illisible est une erreur de l'utilisateur : le
      // laisser passer silencieusement produirait un fichier mal nommé, ce que
      // le trésorier ne verrait qu'au dépôt.
      const typedSiren = input.siren?.trim() ? normalizeSiren(input.siren) : null;
      if (input.siren?.trim() && !typedSiren) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'SIREN invalide : 9 chiffres attendus',
        });
      }

      const siren = typedSiren ?? (await getFecSiren(ctx.prisma));

      const entries = await ctx.prisma.accountingEntry.findMany({
        where: {
          entryDate: {
            gte: new Date(input.startDate),
            lte: new Date(input.endDate),
          },
          isCancelled: false,
        },
        orderBy: [
          { entryDate: 'asc' },
          { journalCode: 'asc' },
          { accountNumber: 'asc' },
        ],
      });

      if (entries.length === 0) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Aucune écriture comptable trouvée pour cette période',
        });
      }

      const mapped = entries.map((e) => ({
        ...e,
        debit: toNum(e.debit),
        credit: toNum(e.credit),
        montantDevise: e.montantDevise ? toNum(e.montantDevise) : undefined,
      }));

      const totalDebit = mapped.reduce((sum, e) => sum + e.debit, 0);
      const totalCredit = mapped.reduce((sum, e) => sum + e.credit, 0);
      const balance = totalDebit - totalCredit;

      if (Math.abs(balance) > 0.01) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Balance comptable déséquilibrée : ${balance.toFixed(2)} XPF`,
        });
      }

      const content = generateFECContent(mapped);

      const filename = buildFECFilename(siren, input.startDate, input.endDate);

      return {
        content,
        filename,
        siren,
        entryCount: entries.length,
        totalDebit,
        totalCredit,
        balance,
      };
    }),

  getStats: adminProcedure
    .input(z.object({
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format date invalide (YYYY-MM-DD)'),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format date invalide (YYYY-MM-DD)'),
      journalCode: z.string().optional(),
    }))
    .output(z.object({
      totalEntries: z.number(),
      totalDebit: z.number(),
      totalCredit: z.number(),
      balance: z.number(),
      byJournal: z.array(z.object({
        journalCode: z.string(),
        journalLib: z.string(),
        count: z.number(),
        debit: z.number(),
        credit: z.number(),
      })),
    }))
    .query(async ({ ctx, input }) => {
      const where: Prisma.AccountingEntryWhereInput = {
        entryDate: {
          gte: new Date(input.startDate),
          lte: new Date(input.endDate),
        },
        isCancelled: false,
      };

      if (input.journalCode) {
        where.journalCode = input.journalCode;
      }

      const entries = await ctx.prisma.accountingEntry.findMany({
        where,
        select: {
          journalCode: true,
          journalLib: true,
          debit: true,
          credit: true,
        },
      });

      let totalDebit = 0;
      let totalCredit = 0;
      const journalMap = new Map<string, { journalLib: string; count: number; debit: number; credit: number }>();

      for (const e of entries) {
        const debit = toNum(e.debit);
        const credit = toNum(e.credit);
        totalDebit += debit;
        totalCredit += credit;

        const existing = journalMap.get(e.journalCode) || {
          journalLib: e.journalLib,
          count: 0,
          debit: 0,
          credit: 0,
        };
        existing.count++;
        existing.debit += debit;
        existing.credit += credit;
        journalMap.set(e.journalCode, existing);
      }

      const byJournal = Array.from(journalMap.entries())
        .map(([journalCode, data]) => ({ journalCode, ...data }))
        .sort((a, b) => a.journalCode.localeCompare(b.journalCode));

      return {
        totalEntries: entries.length,
        totalDebit,
        totalCredit,
        balance: totalDebit - totalCredit,
        byJournal,
      };
    }),
});
