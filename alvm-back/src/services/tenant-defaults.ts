/**
 * Données de référence posées à la création d'une association (tenant).
 *
 * Partagées par le provisionnement (`organization.service.ts`) et les seeds :
 * une association sans ces lignes ne fonctionne pas —
 * `credit-application.service.ts` refuse de valider une facture d'un client
 * qui a des avoirs si le moyen `CREDIT_NOTE` manque.
 */
import type { Db } from '@back/db-context';
import { upsertAppSetting } from '@back/helpers/settings';

export interface SystemPaymentMethod {
  code: string;
  name: string;
  description: string;
  displayOrder: number;
  accountingCode: string;
}

/** Codes comptables alignés sur la migration legacy NestJS (plan comptable ALVM). */
export const SYSTEM_PAYMENT_METHODS: readonly SystemPaymentMethod[] = [
  {
    code: 'CASH',
    name: 'Espèces',
    description: 'Paiement en espèces',
    displayOrder: 1,
    accountingCode: '530000',
  },
  {
    code: 'CHECK',
    name: 'Chèque',
    description: 'Paiement par chèque',
    displayOrder: 2,
    accountingCode: '511200',
  },
  {
    code: 'BANK_TRANSFER',
    name: 'Virement bancaire',
    description: 'Virement sur compte bancaire',
    displayOrder: 3,
    accountingCode: '512000',
  },
  {
    code: 'CREDIT_CARD',
    name: 'Carte bancaire',
    description: 'Paiement par carte bancaire',
    displayOrder: 4,
    accountingCode: '511500',
  },
  {
    code: 'OTHER',
    name: 'Autre',
    description: 'Autre méthode de paiement',
    displayOrder: 5,
    accountingCode: '512000',
  },
  {
    code: 'CREDIT_NOTE',
    name: 'Avoir',
    description: "Utilisation d'un avoir (credit note)",
    displayOrder: 6,
    accountingCode: '411000',
  },
];

/**
 * Réglages `pricing` initiaux. `tax_rate = 0` : les associations visées sont
 * exonérées de TGC (article LP 492 — Loi du pays N°2016-14 du 30/09/2016) ;
 * l'admin de l'association ajuste ensuite depuis ses paramètres.
 */
export const DEFAULT_PRICING_SETTINGS: ReadonlyArray<{
  key: string;
  value: string;
  description: string;
}> = [
  { key: 'currency', value: '"XPF"', description: 'Devise (code ISO)' },
  { key: 'currency_symbol', value: '"XPF"', description: 'Symbole de devise affiché' },
  {
    key: 'default_camp_price',
    value: '5000',
    description: 'Prix par défaut par jour de camp (en XPF)',
  },
  {
    key: 'tax_rate',
    value: '0',
    description: 'Taux de TGC en pourcentage (0 = exonération LP 492)',
  },
  { key: 'payment_terms_days', value: '30', description: 'Délai de paiement par défaut (jours)' },
  { key: 'credit_expiry_days', value: '365', description: 'Durée de validité des avoirs (jours)' },
  {
    key: 'payment_method_inactive_days',
    value: '30',
    description: 'Inactivité avant désactivation méthode de paiement (jours)',
  },
];

/**
 * Pose (ou complète) les données de référence du tenant de la transaction.
 * Idempotent : un moyen de paiement ou un réglage déjà présent n'est jamais
 * écrasé — l'association a pu les ajuster.
 */
export async function ensureTenantDefaults(
  db: Db,
  organizationId: string,
  organizationName: string,
): Promise<void> {
  const existing = await db.paymentMethod.findMany({ select: { code: true } });
  const codes = new Set(existing.map((method) => method.code));
  for (const method of SYSTEM_PAYMENT_METHODS) {
    if (codes.has(method.code)) continue;
    await db.paymentMethod.create({ data: { ...method, active: true, isSystem: true } });
  }

  const settings = await db.appSetting.findMany({ select: { category: true, key: true } });
  const present = new Set(settings.map((setting) => `${setting.category}.${setting.key}`));
  const defaults = [
    ...DEFAULT_PRICING_SETTINGS.map((setting) => ({ category: 'pricing', ...setting })),
    {
      category: 'organization',
      key: 'name',
      value: JSON.stringify(organizationName),
      description: 'Nom de l’organisation',
    },
    {
      category: 'email',
      key: 'from_name',
      value: JSON.stringify(organizationName),
      description: 'Nom d’expéditeur des emails',
    },
  ];
  for (const setting of defaults) {
    if (present.has(`${setting.category}.${setting.key}`)) continue;
    await upsertAppSetting(db, organizationId, setting);
  }
}
