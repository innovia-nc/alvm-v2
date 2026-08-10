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

## TD-003 — Suppression d'un paiement par avoir : allocation non reprise — P3 — OPEN

**Constat (2026-08-09, US-FACT-02)** : `payments.delete` supprime le paiement,
annule ses écritures et recalcule `paid_amount`, mais ne supprime ni la
`CreditNoteAllocation` ni la `CreditApplication` associées, et ne recrédite pas
`ParentCredit.amountRemaining`. Un avoir consommé puis « dé-consommé » par
suppression du paiement reste donc compté comme utilisé.

**Antériorité** : le défaut existe depuis le chemin manuel de règlement par
avoir (`payments.create`) — il n'est pas introduit par l'imputation automatique,
qui écrit exactement les mêmes enregistrements. US-FACT-02 le rend simplement
plus fréquent, puisque les imputations deviennent automatiques.

**Impact** : solde d'avoir sous-évalué après une suppression de paiement. Aucun
impact comptable (les écritures BQ, elles, sont bien annulées).

**Résolution cible** : dans `payments.delete`, si `creditNoteId` est renseigné,
supprimer l'allocation et l'application correspondantes et ré-incrémenter
`amountRemaining`, le tout dans la transaction existante. Prévoir un test
« imputer → supprimer le paiement → solde restauré ».

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
