/**
 * Seed idempotent des moyens de paiement standards.
 *
 * A executer en prod via : pnpm tsx prisma/seed-payment-methods.ts
 *
 * Codes comptables alignes sur la migration legacy NestJS
 * (alvm-back/prisma/migrations/20260308000001_db_functions_triggers_rls/migration.sql).
 *
 * Idempotent via upsert sur `code` (unique). Sur a rejouer.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type PaymentMethodSeed = {
  code: string;
  name: string;
  description: string;
  active: boolean;
  displayOrder: number;
  isSystem: boolean;
  accountingCode: string;
};

const PAYMENT_METHODS: PaymentMethodSeed[] = [
  {
    code: 'CASH',
    name: 'Especes',
    description: 'Paiement en especes',
    active: true,
    displayOrder: 1,
    isSystem: true,
    accountingCode: '530000',
  },
  {
    code: 'CHECK',
    name: 'Cheque',
    description: 'Paiement par cheque',
    active: true,
    displayOrder: 2,
    isSystem: true,
    accountingCode: '511200',
  },
  {
    code: 'BANK_TRANSFER',
    name: 'Virement bancaire',
    description: 'Virement sur compte bancaire',
    active: true,
    displayOrder: 3,
    isSystem: true,
    accountingCode: '512000',
  },
  {
    code: 'CREDIT_CARD',
    name: 'Carte bancaire',
    description: 'Paiement par carte bancaire',
    active: true,
    displayOrder: 4,
    isSystem: true,
    accountingCode: '511500',
  },
  {
    code: 'OTHER',
    name: 'Autre',
    description: 'Autre methode de paiement',
    active: true,
    displayOrder: 5,
    isSystem: true,
    accountingCode: '512000',
  },
  {
    code: 'CREDIT_NOTE',
    name: 'Avoir',
    description: "Utilisation d'un avoir (credit note)",
    active: true,
    displayOrder: 6,
    isSystem: true,
    accountingCode: '411000',
  },
];

async function main() {
  console.log('Seeding payment methods (idempotent)...');

  let inserted = 0;
  let updated = 0;

  for (const pm of PAYMENT_METHODS) {
    const existing = await prisma.paymentMethod.findUnique({
      where: { code: pm.code },
      select: { id: true },
    });

    await prisma.paymentMethod.upsert({
      where: { code: pm.code },
      update: {
        name: pm.name,
        description: pm.description,
        displayOrder: pm.displayOrder,
        isSystem: pm.isSystem,
        accountingCode: pm.accountingCode,
      },
      create: {
        code: pm.code,
        name: pm.name,
        description: pm.description,
        active: pm.active,
        displayOrder: pm.displayOrder,
        isSystem: pm.isSystem,
        accountingCode: pm.accountingCode,
      },
    });

    if (existing) updated++;
    else inserted++;
  }

  console.log(`Done. ${inserted} inserted, ${updated} updated/synced.`);

  const rows = await prisma.paymentMethod.findMany({
    select: {
      code: true,
      name: true,
      active: true,
      isSystem: true,
      accountingCode: true,
      displayOrder: true,
    },
    orderBy: { displayOrder: 'asc' },
  });
  console.table(rows);
}

main()
  .catch((e) => {
    console.error('Seed payment_methods failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    void prisma.$disconnect();
  });
