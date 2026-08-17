# CLAUDE.md — Projet ALVM Vercel (Monolithe)

## Presentation

Application de gestion de camps de vacances pour l'ALVM.
Monolithe Next.js deployable sur Vercel + Neon PostgreSQL (integration Vercel).

Refonte de l'architecture 2 apps (alvm-back NestJS + alvm-selfhosted Next.js)
en une seule application Next.js App Router.

## Stack

- **Runtime** : Node.js 22, pnpm 9
- **Framework** : Next.js 15.x (App Router)
- **API** : tRPC 11.x (via `/api/trpc/[trpc]` route handler)
- **ORM** : Prisma 6.x (PostgreSQL via Neon)
- **Auth** : NextAuth v5 (Credentials provider, JWT sessions)
- **Validation** : Zod 4.x
- **UI** : shadcn/ui, Tailwind CSS 3.x, Radix UI
- **Tests** : Vitest 2.x
- **Deploiement** : Vercel (front + API), Neon (BDD) — voir docs/deploiement.md

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

### Imputation automatique des avoirs (US-FACT-02)
`server/services/credit-application.service.ts` impute les credits disponibles
d'un client sur une facture, en FIFO, lors de la validation (`invoices.validate`,
DRAFT → SENT). Regle : du credit le plus ancien au plus recent, imputation
partielle autorisee, reliquat conserve, credits expires et avoirs annules exclus.

**Invariant comptable a ne pas casser** : une imputation N'A PAS de schema
comptable propre. Elle cree un `Payment` porte par la methode de reglement
`CREDIT_NOTE`, ce qui fait produire a `createPaymentEntries()` l'ecriture
D 4191 / C 411000 — contrepartie exacte du C 4191 pose a l'emission de l'avoir
(`createCreditNoteAccountingEntries` avec `isFutureCredit`). Ne jamais ecrire
d'ecriture ad hoc pour une imputation d'avoir : le FEC serait desequilibre.

Chaque imputation ecrit aussi une `CreditApplication` (historique metier affiche
sur la fiche de l'avoir) et une `CreditNoteAllocation` (miroir du chemin manuel
`payments.create`, qui agrege ce modele pour interdire une double consommation).

**Second invariant (TD-003)** : le solde d'un avoir a DEUX representations —
`ParentCredit.amountRemaining` et la somme des `CreditNoteAllocation`. Les deux
chemins d'imputation (automatique et manuel via `payments.create`) doivent
mettre a jour les DEUX, et `payments.delete` doit les restituer via
`restoreCreditOnPaymentDeletion()`. Si un chemin n'en met qu'une a jour, un
avoir consomme peut etre reimpute par le FIFO et le compte 4191 se retrouve
debite plus qu'il n'a ete credite.

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

### Nom du fichier FEC (TD-012)
L'article A47 A-1 du LPF impose `SIRENFECAAAAMMJJ.txt` (AAAAMMJJ = date de
cloture de l'exercice, ici la date de fin de la periode exportee). Le SIREN vit
dans `app_settings.accounting.fec_siren` et se lit via `getFecSiren()` ; le
champ de l'ecran d'export ne fait que le surcharger ponctuellement. Il ne figure
PAS dans le contenu du fichier — les 18 colonnes du FEC n'ont pas ce champ.
Sans SIREN, l'export reste possible sous le nom historique et l'ecran previent
de la non-conformite : ne jamais bloquer un export comptable pour un nommage.

### Afficher un statut : toujours `<StatusBadge />` (TD-013)
`components/shared/status-badge.tsx` porte le libelle francais, la couleur
calibree WCAG AA (utilities `status-badge-*` de `app/globals.css`) et l'icone
de chaque statut metier. Ne jamais reecrire un `getStatusBadge()` local ni
afficher l'enum brut : c'est exactement ce qui a fait lire `IMMEDIATE_REFUND`
aux utilisateurs et contourner les couleurs calibrees sur les badges d'ACM.
Un nouveau statut s'ajoute dans la table du fichier partage, avec son test dans
`test/unit/status-badge.spec.ts`.

### Soft-delete
- Extension Prisma `soft-delete.ts` ajoute `deletedAt: null` automatiquement
- Pour les enregistrements supprimes : `{ deletedAt: { not: null } }`
- L'extension ne filtre que le `where` **de premier niveau** des lectures
  (`findFirst`/`findMany`/`count`/`aggregate`/`groupBy`). Une relation lue en
  `include`/`select` imbrique n'est PAS filtree : `children_parents` conserve
  donc ses lignes vers des enfants archives, invisibles cote UI.

### PDF — reserver la place du pied de page
`PDFFooter` (`lib/pdf/shared/pdf-footer.tsx`) est en `position: absolute` : il
sort du flux. **Tout document qui le rend doit poser
`paddingBottom: PDF_FOOTER_RESERVED_SPACE` sur le style de sa `Page`**, sinon le
contenu qui coule en bas de page s'ecrit DESSOUS (deja remonte deux fois en
recette : US-UX-03 puis US-FACT-01-bis). Ajouter aussi le nouveau document a
`test/unit/pdf-footer-overlap.spec.tsx` — le defaut n'apparait qu'au calcul de
mise en page, un test d'arbre React ne le voit pas.

### PDF d'avoir — montants en valeur absolue
Un avoir stocke ses montants **negatifs** en base, mais `CreditNotePDF` pose
lui-meme le signe « - » devant chaque valeur. `creditNotes.generatePDF` transmet
donc des `Math.abs(...)` — sinon le document affiche `--12 000 XPF`. Ne pas
"corriger" ces `Math.abs` sans regarder le composant.

### Supprimer un fichier : la ligne ET le blob (TD-006)
Toute suppression d'un enregistrement qui porte une URL de fichier
(`ChildDocument.fileUrl`, `StaffDocument.fileUrl`, `organization.logo_url`) doit
appeler `deleteFromStorageBestEffort(url, contexte)` **apres** l'ecriture en
base. Deux regles :
- la base d'abord — sinon un echec de suppression en base laisse une ligne qui
  pointe vers un objet disparu ;
- best effort — un store injoignable est trace, jamais propage : un document que
  l'utilisateur a supprime ne doit pas ressusciter parce que Vercel Blob a
  hoquete.

### Envoi d'email (TD-008)
`server/services/email.service.ts` est le seul point d'envoi (API REST Resend).
La cle vit dans l'environnement (`RESEND_API_KEY`), l'identite d'expedition dans
les settings `email`. Un environnement sans cle n'est pas un bug : les
procedures levent `PRECONDITION_FAILED` et les ecrans desactivent le bouton via
`settings.isEmailConfigured`. Ne jamais inventer de code d'erreur tRPC — c'est
exactement ce que faisait le `'NOT_IMPLEMENTED' as any` supprime par TD-008.

### Un enfant a toujours au moins un parent
Invariant porte par un **trigger legacy** de la BDD (absent du depot, donc
invisible des tests mockes) : supprimer une ligne `children_parents` qui
laisserait un enfant sans aucun parent leve
`Impossible de retirer le dernier parent d'un enfant`. Le trigger ignore le
soft-delete — un enfant archive compte comme un enfant.

Consequences pour `parents.delete` :
- verifier **avant** toute ecriture, enfant par enfant, s'il reste un autre
  parent actif ; si non et que l'enfant est actif → refus explicite ;
- ne supprimer que les liens des enfants qui conservent un autre parent ;
  **conserver** les liens vers des enfants archives ;
- ne jamais laisser remonter l'erreur brute de Prisma a l'utilisateur.

Voir TD-005 dans `docs/dette-technique.md` (inventaire des triggers legacy).

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
2. **Lot 2** : users, parents, childDocuments (le routeur `auth` a ete retire :
   NextAuth porte la session et le profil)
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

## Documents

- `docs/deploiement.md` — topologie Vercel/Neon, vars d'env, procedure de migration, incident 2025-11.
- `docs/dette-technique.md` — registre de dette (OPEN : TD-001 typage any des mappers ; TD-005 triggers legacy absents du depot — « dernier parent » et `payment_status` ; TD-009 aucune limitation de debit sur l'authentification ; TD-010 procedures tRPC sans ecran ; TD-011 auto-inscription parent sans serveur ; TD-014 route de presence en double, sans lien ; TD-015 modeles NextAuth `Session`/`VerificationToken` inutilises ; TD-016 aucun ecran « mon compte » self-service ; TD-017 ecran d'habilitations `/dashboard/admin/users` hors navigation ; TD-018 colonnes Prisma jamais lues ni ecrites ; TD-019 `isPasswordStrong` sans appelant serveur ; TD-020 `prisma/reset-data.sql` orphelin et trompeur ; TD-021 `user.name`/`user.emailVerified` transportes sans lecteur ; TD-022 douze formatages de date dupliques ; **TD-024 trois appels `/api/upload/*` sans route (logo et documents non televersables — P1)** ; TD-023 aucune borne d'age sur un camp ; TD-025 quatre ecrans dupliques entre ADMIN et STAFF. DONE : TD-002 factures legacy 0 XPF ; TD-003 divergence des deux vues du solde d'un avoir ; TD-004 reserve du pied de page PDF ; TD-006 blobs orphelins ; TD-007 PDF d'avoir cable ; TD-008 envoi d'email implemente ; TD-012 SIREN du FEC cable ; TD-013 statuts affiches via StatusBadge ; TD-A2 couverture PDF facture).
- `docs/stories/BACKLOG.md` — backlog produit + **backlog MIKADO livre le 2026-08-09** (7 US, arbitrages US-FACT-02 tranches) + **retours de recette livres le 2026-08-10** (4 US : PDF facture, selecteur d'avoir, suppression de parent).
- `docs/test-evidence/recette-v2.0.1/` — recette visuelle Playwright (19/19 PASS, `pnpm recette`) + rapport de preuve.
- `CHANGELOG.md` — journal des livraisons (v2.0.0 premiere prod de la refonte + v2.0.1 correctifs campagne smoke, 2026-07-06).
- `docs/retros.md` — retros et post-mortems (incident pipeline orphelin, bugs campagne smoke).
- `test/e2e-smoke/smoke.mjs` — campagne de tests reels rejouable (`pnpm smoke`, sur clone de prod uniquement).

## Tests
- Convention : `test/unit/{module}.spec.ts`
- Helper `test/helpers/test-caller.ts` : caller tRPC avec Prisma mocke
- Helper `test/helpers/mock-prisma.ts` : mock profond de tous les modeles
- Toujours mocker `$queryRawUnsafe` et `accountingEntry.create` pour les tests comptables
- L'environnement Vitest global est `node` (tests routers/services prisma-mockes). Pour un test de **hook ou composant React** (DOM requis), NE PAS changer la config globale : ajouter le docblock `// @vitest-environment jsdom` en tete du fichier de test (`@testing-library/react` + `jsdom` sont en devDeps). Ex : `test/unit/use-server-pagination.spec.ts`.

### Tests reels sur clone de prod (avant chaque mise en prod)
Les tests unitaires sont mockes : ils ne voient ni les CHECK/triggers legacy de
la BDD, ni les donnees reelles. Deux campagnes **rejouables sur un clone de prod**
(Postgres jetable, JAMAIS la prod — procedure : `docs/deploiement.md`) :
- `pnpm smoke` — campagne API/invariants comptables (`test/e2e-smoke/smoke.mjs`).
- `pnpm recette` — **recette visuelle Playwright** simulant les parcours
  utilisateurs ADMIN + PARENT (8 guides), une capture par critere. Spec et
  preuves : `docs/test-evidence/recette-v2.0.1/` (rapport dans `rapport.md`).

## Ce qu'il ne faut PAS faire
- Ne pas hardcoder `0.11` pour le taux TGC
- Ne pas oublier `version` dans les appels a `invoices.updateStatus`
- Ne pas creer de `parent_credits` dans les services comptables (c'est gere cote router)
- Runtime BDD via le pooler pgbouncer Neon (POSTGRES_PRISMA_URL) ; la connexion directe (POSTGRES_URL_NON_POOLING) est reservee aux migrations
- Ne pas utiliser `prisma migrate dev` sur Neon en production — SQL manuel repete sur clone + `db push` (procedure : docs/deploiement.md)
