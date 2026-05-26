# CLAUDE.md — Projet ALVM Vercel (Monolithe)

## Presentation

Application de gestion de camps de vacances pour l'ALVM.
Monolithe Next.js deployable sur Vercel + Supabase PostgreSQL.

Refonte de l'architecture 2 apps (alvm-back NestJS + alvm-selfhosted Next.js)
en une seule application Next.js App Router.

## Stack

- **Runtime** : Node.js 22, pnpm 9
- **Framework** : Next.js 15.x (App Router)
- **API** : tRPC 11.x (via `/api/trpc/[trpc]` route handler)
- **ORM** : Prisma 6.x (PostgreSQL via Supabase)
- **Auth** : NextAuth v5 (Credentials provider, JWT sessions)
- **Validation** : Zod 4.x
- **UI** : shadcn/ui, Tailwind CSS 3.x, Radix UI
- **Tests** : Vitest 2.x
- **Deploiement** : Vercel (front + API), Supabase (BDD)

## Architecture

```
alvm-vercel/
├── app/                  ← Next.js App Router (pages + API routes)
├── components/           ← React components (ui/, layout/, features/)
├── lib/                  ← Client-side utilities (auth, trpc, hooks, validation)
├── server/               ← Server-side code (tRPC routers, services, helpers)
│   ├── trpc/             ← tRPC init, context, root router
│   ├── routers/          ← Domain routers (migres depuis NestJS)
│   ├── services/         ← Business logic (accounting, etc.)
│   ├── helpers/          ← Shared helpers (decimal, settings, date)
│   └── extensions/       ← Prisma extensions (soft-delete)
├── prisma/               ← Schema + migrations
└── test/                 ← Tests Vitest
```

## Differences majeures vs architecture precedente

### Plus de NestJS
Les routers tRPC s'executent directement dans Next.js via le route handler
`/api/trpc/[trpc]`. Le contexte tRPC utilise `auth()` de NextAuth au lieu
de dechiffrer manuellement les JWT.

### Plus de triggers SQL
Les ecritures comptables VE (ventes) sont generees par
`server/services/accounting.service.ts` au lieu de triggers PostgreSQL.
Les ecritures BQ (banque) restent dans le meme fichier.
Fonctions cles :
- `createInvoiceAccountingEntries()` — remplace le trigger `generate_invoice_accounting_entries`
- `createCreditNoteAccountingEntries()` — remplace le trigger `generate_credit_note_accounting_entries`
- `createPaymentEntries()` / `createRefundEntries()` — migres depuis `accounting.helper.ts`

### Plus de RLS PostgreSQL
Le filtrage est applicatif via Prisma extensions. Le `soft-delete.extension.ts`
filtre automatiquement les enregistrements supprimes. Le filtrage par tenant/parent
sera gere par les guards tRPC et la logique des routers.

### tRPC Server Components
Les Server Components appellent les routers directement via `createCaller`
(pas de round-trip HTTP). Voir `lib/trpc/server.ts`.

### Auth simplifiee
Le `verifyCredentials` est maintenant local (Prisma query directe + bcrypt)
au lieu d'un appel HTTP au backend. Le mot de passe hashé est stocké dans
`Account.providerAccountId` ou `provider = 'credentials'`.

## Conventions (heritees du projet original)

### Comptabilite
- Ne JAMAIS hardcoder le taux TGC — utiliser les valeurs stockees sur la facture
- **ALVM est exoneree de TGC** au titre de l'article LP 492 — Loi du pays N°2016-14 du 30 septembre 2016. `tax_rate = 0` dans `app_settings.pricing` est volontaire et legal. Le footer facture mentionne explicitement cette exoneration. Ne JAMAIS "corriger" cette valeur a 11 — toutes les factures emises sont a TGC=0 par design.
- Le compte auxiliaire client : `'AUX' + uuid.replace(/-/g, '').slice(0, 8)`
- `deriveClientAux()` n'existe plus qu'en TypeScript (plus de version SQL)
- Les ecritures VE sont creees quand `status` passe a `SENT` (appel explicite dans le router)
- Les ecritures BQ sont creees lors de la creation d'un paiement/remboursement

### Soft-delete
- Extension Prisma `soft-delete.ts` ajoute `deletedAt: null` automatiquement
- Pour les enregistrements supprimes : `{ deletedAt: { not: null } }`

### Optimistic locking
- Champ `version` sur Invoice — `updateMany({ where: { id, version } })`

### Transitions de statut facture
```
DRAFT → SENT | CANCELLED
SENT → PAID | OVERDUE | CANCELLED (si paidAmount == 0)
OVERDUE → PAID | CANCELLED
PAID → CREDITED
CANCELLED → (rien)
CREDITED → (rien)
```

## Migration des routers

Les routers sont a migrer depuis `alvm-back/src/modules/` vers `server/routers/`.
Ordre de migration recommande :

1. **Lot 1** : settings, campTypes, paymentMethods, staff (CRUD simples)
2. **Lot 2** : auth, users, parents, childDocuments
3. **Lot 3** : children, camps, attendances
4. **Lot 4** : registrations
5. **Lot 5** : invoices, payments, creditNotes, refunds, fec

Pour chaque router :
- Copier le code du router NestJS
- Retirer les imports NestJS, garder les imports tRPC
- Adapter les imports des helpers (`@/server/helpers/*`, `@/server/services/*`)
- Pour les routers de facturation : remplacer les appels au trigger par
  `createInvoiceAccountingEntries()` / `createCreditNoteAccountingEntries()`
- Migrer les tests correspondants

## Tests
- Convention : `test/unit/{module}.spec.ts`
- Helper `test/helpers/test-caller.ts` : caller tRPC avec Prisma mocke
- Helper `test/helpers/mock-prisma.ts` : mock profond de tous les modeles
- Toujours mocker `$queryRawUnsafe` et `accountingEntry.create` pour les tests comptables

## Ce qu'il ne faut PAS faire
- Ne pas hardcoder `0.11` pour le taux TGC
- Ne pas oublier `version` dans les appels a `invoices.updateStatus`
- Ne pas creer de `parent_credits` dans les services comptables (c'est gere cote router)
- Ne pas exposer le port PostgreSQL Supabase — utiliser le connection pooler (port 6543)
- Ne pas utiliser `prisma migrate dev` sur Supabase en production — utiliser `prisma db push` ou `prisma migrate deploy`
