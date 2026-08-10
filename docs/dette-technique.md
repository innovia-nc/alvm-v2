# Dette technique — ALVM

Registre priorisé (P0 = bloquant, P3 = confort). Items `OPEN` / `DONE`.

## TD-002 — 10 factures brouillon legacy à 0 XPF en prod — P2 — DONE (2026-07-06)

**Constat (2026-07-06, campagne de tests réels)** : les 10 factures présentes en
prod sont des **brouillons legacy à 0 XPF** (créés par l'ancienne app avant le
câblage des prix — lignes et `unit_price` à 0). Conséquence fonctionnelle : le
formulaire de paiement ne propose que les factures avec un restant dû
(`remainingAmount > 0`), donc **aucune n'est payable** et la liste apparaît vide.

**Ce n'est pas un bug applicatif** : le code neuf facture correctement (25 000 XPF,
TGC 0 — prouvé par la recette v2.0.1). C'est un **nettoyage de données** à faire
côté association.

**Résolution cible (action métier, pas code)** : annuler (CANCELLED) ou refacturer
ces 10 brouillons via l'app — les montants se préremplissent depuis les tarifs
des camps. À faire avec l'ALVM avant la bascule en usage réel des paiements.

**Script d'assainissement préparé** : `prisma/migrations-manual/2026-07-06-cancel-legacy-zero-invoices.sql`
passe les 10 factures 0 XPF en CANCELLED (reproduit `invoices.updateStatus` :
status + version++), idempotent, gardé (total=0, paid=0, DRAFT/SENT, 0 écriture).
Les inscriptions restent CONFIRMED/UNPAID → refacturables au bon tarif ensuite.
**Testé sur clone de prod le 2026-07-06** (10→CANCELLED, 15 inscriptions restées
refacturables, re-run = 0).

**✅ Appliqué en prod le 2026-07-06** (validation Mathieu) : 10 factures →
CANCELLED, la 11ᵉ facture SENT (non nulle, réelle) correctement exclue par le
garde-fou ; 15 inscriptions CONFIRMED/UNPAID préservées et refacturables.
**Reste (action ALVM)** : refacturer au bon tarif les inscriptions concernées
via l'app (les montants se préremplissent depuis les tarifs des camps).

## TD-003 — Solde d'un avoir : deux vues divergentes — P2 — DONE (2026-08-10)

**Constat initial (2026-08-09, US-FACT-02)** : `payments.delete` supprime le
paiement, annule ses écritures et recalcule `paid_amount`, mais ne reprenait ni
la `CreditNoteAllocation`, ni la `CreditApplication`, ni
`ParentCredit.amountRemaining`. Un avoir « dé-consommé » restait compté comme
utilisé.

**Défaut plus large trouvé au traitement (P2, pas P3)** : le solde d'un avoir se
lisait de **deux façons divergentes**.

| Vue | Alimentée par | Lue par |
|-----|---------------|---------|
| `ABS(total_amount) - SUM(credit_note_allocations)` | chemin manuel `payments.create` | contrôle de solde du chemin manuel |
| `ParentCredit.amountRemaining` | imputation automatique uniquement | FIFO de `applyAvailableCreditsToInvoice` |

Le chemin manuel ne décrémentait **jamais** `amountRemaining`. Un avoir consommé
à la main restait donc « plein » aux yeux du FIFO, qui pouvait le réimputer sur
une facture suivante. Scénario : avoir de 5 000 appliqué manuellement sur la
facture A, puis facture B validée → 5 000 réimputés. Le compte **4191 se
retrouve débité de 10 000 pour 5 000 crédités** — déséquilibre de fond au FEC.

Ce second volet n'était pas visible avant US-FACT-02 : tant que personne ne
lisait `amountRemaining`, sa dérive était sans conséquence.

**✅ Résolu (2026-08-10)** :
- `payments.create` décrémente `amountRemaining` (plancher à 0) et écrit une
  `CreditApplication`, pour que l'historique soit uniforme quel que soit le
  chemin. Le garde-fou du chemin manuel reste le solde calculé sur les
  allocations : comportement inchangé, aucun risque de régression.
- `restoreCreditOnPaymentDeletion()` (`credit-application.service.ts`), appelé
  par `payments.delete` avant la suppression : décrémente ou supprime
  l'allocation, retire la ligne d'historique, recrédite `amountRemaining`
  plafonné au montant initial (une double suppression ne peut pas gonfler
  l'avoir).
- Tests : 8 cas de service (dont le cycle imputation → suppression →
  redisponibilité) et 7 cas de router. Vérifiés en échec sans le correctif.

**Reste à faire côté données** : les avoirs consommés à la main **avant** ce
correctif peuvent porter un `amount_remaining` surévalué. Diagnostic en lecture
seule fourni : `prisma/migrations-manual/2026-08-10-diagnostic-solde-avoirs.sql`
(la requête de réalignement est commentée dans le même fichier, à n'exécuter
qu'après lecture des écarts). Volume attendu proche de zéro — les paiements
réels sont quasi inexistants en prod à ce jour (cf. TD-002).

## TD-A2 — Couverture de test du PDF facture — P3 — DONE (2026-08-09)

**Constat (2026-06-08, QA Lot A)** : FEAT-001 n'était couvert que sur la shape
de la requête `generatePDF` ; ni le mapping des paiements ni le rendu du bloc
PDF n'étaient testés.

**✅ Résolu (US-FACT-01)** : `test/unit/invoice-pdf.spec.tsx` (7 cas) couvre le
rendu du bloc « MODES DE RÈGLEMENT » — facture non réglée, réglée en un
paiement, réglée en plusieurs paiements, partiellement réglée, soldée, et
règlement par avoir. `test/helpers/react-tree.ts` fournit l'introspection
d'arbre React nécessaire (les composants `@react-pdf` ne produisent pas de DOM).

## TD-001 — Typage `any` des mappers dans `server/routers/**` — P2 — OPEN

**Constat (2026-07-06, introduction d'ESLint)** : les fonctions de mapping
(`mapInvoice`, `mapInvoiceWithDetails`, `mapCreditNote`, `mapRegistration`,
`generateFECContent`, helpers de `child-documents`…) typent leur paramètre
Prisma en `any` (~50 occurrences). La règle `@typescript-eslint/no-explicit-any`
est temporairement rétrogradée en `warn` sur `server/routers/**` uniquement
(voir `eslint.config.mjs`) — elle reste en `error` partout ailleurs.

**Risque** : dérive silencieuse entre le `select`/`include` Prisma et les champs
réellement lus par les mappers (contrat §5.12) — le tsc ne détecte rien sur ces
fonctions.

**Résolution cible** : typer chaque mapper avec `Prisma.XGetPayload<{ include: … }>`
aligné sur le call-site, puis supprimer l'override ESLint. À traiter router par
router (invoices, credit-notes, registrations, fec, child-documents).

**Preuve du risque** : la même campagne de typage côté front (2026-07-06) a
révélé deux bugs réels masqués par `any` : champ inexistant
`selectedPayment.paymentMethod` affiché dans le formulaire de remboursement, et
`new Date(null)` possible sur la période d'un camp dans le formulaire
d'inscription.
