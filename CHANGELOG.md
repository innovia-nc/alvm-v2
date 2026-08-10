# Changelog

Toutes les évolutions notables de ce projet sont documentées ici.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [Unreleased]

### Fixed — TD-003 : solde des avoirs (2026-08-10)
- **Un avoir consommé à la main pouvait être réimputé automatiquement.** Le
  solde d'un avoir se lisait de deux façons divergentes : le règlement manuel
  agrégeait les allocations sans jamais décrémenter
  `ParentCredit.amountRemaining`, sur lequel s'appuie le FIFO de US-FACT-02. Un
  avoir réglé manuellement restait donc « plein » pour l'imputation automatique,
  qui pouvait le consommer une seconde fois — le compte 4191 se retrouvant
  débité de plus qu'il n'avait été crédité. Les deux chemins tiennent désormais
  les deux vues à jour, et le règlement manuel écrit lui aussi son historique de
  consommation.
- **Supprimer un règlement par avoir restitue le crédit.** L'allocation est
  décrémentée ou supprimée, la ligne d'historique retirée et le solde recrédité
  (plafonné au montant initial, pour qu'une double suppression ne gonfle pas
  l'avoir). Auparavant les écritures étaient bien annulées mais l'avoir restait
  compté comme utilisé.
- Diagnostic en lecture seule des données antérieures :
  `prisma/migrations-manual/2026-08-10-diagnostic-solde-avoirs.sql`.

### Added — backlog MIKADO (2026-08-09)
- **US-FACT-02 — déduction automatique des avoirs sur la facture suivante.**
  À l'émission d'une facture (DRAFT → SENT), les crédits disponibles du client
  sont imputés en FIFO (du plus ancien au plus récent), avec imputation
  partielle et report du reliquat. Crédits expirés et avoirs annulés exclus.
  Chaque imputation est matérialisée par un paiement « Avoir », qui produit
  l'écriture BQ D 4191 / C 411000 — contrepartie exacte du C 4191 posé à
  l'émission de l'avoir : **aucun schéma comptable nouveau**. Historique de
  consommation (date, facture, montant) et solde restant visibles sur la fiche
  de l'avoir. Réactive FEAT-005, abandonnée en juin faute de cadrage comptable.
- **US-PERS-01 — génération de mot de passe du personnel.** Bouton « Générer un
  mot de passe » (Web Crypto, 12 caractères minimum, 4 classes, sans caractère
  ambigu), champ affiché en clair, bouton « Copier », et modale bloquante
  rappelant à la création que le mot de passe ne sera plus affiché.
- **US-FACT-01 (complément) — mention « Non réglée »** sur le PDF facture, et
  « Partiellement réglée — reste à payer X » quand un solde subsiste. Les
  règlements par avoir affichent le numéro de l'avoir imputé.

### Changed — backlog MIKADO (2026-08-09)
- **US-UX-01 — la recherche ne se déclenche plus pendant la frappe.** Le
  debounce des tables serveur est remplacé par une validation explicite
  (touche « Entrée » ou bouton « Rechercher »), sur les ~19 tables du produit.

### Fixed — backlog MIKADO (2026-08-09)
- **US-UX-01 (volet caché) — 6 barres de recherche totalement inertes**
  réactivées : Personnel (admin et staff), Factures, Avoirs, Remboursements et
  Paiements côté staff. Le `searchKey` était posé mais ni `onSearchChange` ni le
  paramètre `search` n'étaient transmis ; les routers l'acceptaient déjà.
- **US-UX-02 — contraste du sélecteur d'enfant en mode sombre** (Inscription >
  Nouvelle inscription) : couleurs codées en dur remplacées par les tokens du
  design system, qui sont déclinés dans la palette sombre.
- **US-UX-03 — bloc signature de la fiche enfant recouvert.** Les 5 points
  d'autorisation étaient passés au footer PDF, positionné en absolu, et se
  superposaient au cadre de signature. Ils sont désormais rendus dans le flux,
  après la signature, avec une marge basse réservée.
- **US-PERS-02 — fiche détail du personnel épurée** : suppression de
  « Documents PDF liés à ce personnel (0) » et « Aucun document PDF pour ce
  personnel. ».
- `pnpm lint` était cassé (dépendance `@eslint/eslintrc` absente du manifeste) :
  la gate lint n'était pas exécutable. Rétabli — 0 erreur.

### Fixed
- Assainissement données (TD-002) : les 10 factures brouillon legacy à 0 XPF
  (importées de l'ancienne app, non payables) sont passées en **Annulée** en
  prod. Les inscriptions liées restent confirmées/non payées et peuvent être
  refacturées au bon tarif. Script idempotent versionné
  (`prisma/migrations-manual/2026-07-06-cancel-legacy-zero-invoices.sql`).

## [2.0.1] — 2026-07-06

Correctifs issus du test du flux métier de bout en bout puis de la **campagne
smoke E2E sur clone de prod** (41 vérifications — voir `docs/deploiement.md`
§ campagne et `docs/retros.md`, addenda du 2026-07-06). Déployés en prod le jour même.

### Fixed
- **TGC facturée à tort (P0 légal)** : ALVM est exonérée (art. LP 492) mais la
  catégorie `pricing` d'`app_settings` n'avait jamais été seedée en prod et le
  fallback codé valait 11 %. Fallback et seed à 0, 7 clés `pricing` insérées en
  prod (`tax_rate = 0` vérifié).
- Validation d'une facture à 0 XPF : garde « montant nul » dans les écritures
  comptables (plus de 500, aucune écriture 0/0 possible).
- Création d'un parent sans code postal : 500 causé par un CHECK legacy
  (5 caractères stricts) incompatible avec le contrat optionnel — contrainte
  assouplie en prod (`''` OU 5) + validation Zod 5 chiffres si renseigné.
- Création d'un enfant hors tranche 0–18 ans : message de validation clair au
  lieu d'une erreur Postgres brute.
- Remboursements : `create`/`delete` recalculent désormais `paid_amount` et le
  statut de la facture (IMMEDIATE_REFUND uniquement — un FUTURE_CREDIT reste acquis).
- Inscription payée : la confirmation (→ CONFIRMED) reste permise pour ne pas
  bloquer les présences ; CANCELLED/WAITLIST toujours refusés.

### Added
- **Campagne de tests réels rejouable** : `pnpm smoke`
  (`test/e2e-smoke/smoke.mjs`) — flux d'écriture métier complets + invariants
  comptables + scoping par rôle, sur un clone de prod, à lancer avant chaque
  mise en production significative.

## [2.0.0] — 2026-07-06

**Première mise en production de la refonte monolithe** sur `alvm-v2.vercel.app`.
La prod tournait depuis le 25 nov. 2025 sur l'ancien repo `alvm-v2` (supprimé) :
le projet Vercel, orphelin de son repo Git, n'avait plus reçu aucun déploiement.
Livraison : les 95 commits de la refonte + les correctifs ci-dessous, avec
migration de la base Neon de prod (données réelles préservées, répétée sur clone
local — voir `prisma/migrations-manual/2026-07-06-alignement-refonte.sql` et
`docs/deploiement.md`).

### Deploy / Infra
- `maxDuration = 60` sur les 4 endpoints générant des PDF (`api/generate/*`, `api/trpc`).
- Prisma : runtime via le pooler pgbouncer Neon (`POSTGRES_PRISMA_URL`), connexion directe réservée aux migrations.
- `AUTH_SECRET` ajouté aux environnements Vercel (NextAuth v5, fail-closed).
- ESLint 9 flat config câblé (aucune config n'existait) ; typage strict rétabli sur le code applicatif — 2 bugs latents corrigés au passage (champ inexistant affiché dans le formulaire de remboursement, date nullable non gardée dans le formulaire d'inscription). Dette restante : TD-001 (`docs/dette-technique.md`).
- Tests : horloge figée dans `registrations.spec` (10 tests pourrissaient avec le temps) ; décision produit — tout STAFF peut modifier tout camp (entérine `19ccf9c`).

### Added
- **FEAT-001** : affichage des modes de règlement (chèque, espèces, aides…) sur la facture PDF, dans un bloc « Modes de règlement » après les totaux.
- **FEAT-002** : libellés des titres de sections renommés en « Parent / Client » et « Enfant / Stagiaire » (espaces staff et admin).
- **FEAT-003** : historique des inscriptions par enfant sur la fiche enfant (contextes admin, staff et parent). Le parent ne voit que ses propres enfants (scope server-side).
- **FEAT-004** : traçabilité interne des factures — « Créé par » / « Validé par » affichés sur le détail facture côté admin/staff. Jamais exposé aux parents ni sur le PDF client. Migration : 2 colonnes optionnelles `created_by_id` / `validated_by_id` sur `invoices` (à appliquer en `prisma migrate deploy` / `db push` — jamais `migrate dev` sur Supabase).

### Fixed
- **BUG-001** : la recherche par saisie de texte dans la liste des inscriptions ne filtrait pas. Cause : référence instable de l'objet retourné par `useServerPagination`, provoquant une boucle de re-render dans `DataTableServer`. Le hook est désormais mémoïsé (useCallback/useMemo) — correction transverse à toutes les tables paginées côté serveur.

### Tests
- Ajout de `test/unit/use-server-pagination.spec.ts` (24 tests) verrouillant la stabilité référentielle du hook `useServerPagination` (anti-régression du fix BUG-001 sur les tables paginées).
