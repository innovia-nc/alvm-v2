# Changelog

Toutes les évolutions notables de ce projet sont documentées ici.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [Unreleased]

### Removed — deuxième passe de code mort (2026-08-10)
- **Le routeur `auth` entier était mort.** Ses quatre procédures (`me`,
  `updateProfile`, `changePassword`, `deleteAccount`) n'étaient appelées par
  aucune page : la session et le profil viennent de NextAuth, le mot de passe de
  `users.resetPassword`, la suppression d'un compte de `parents.delete` /
  `users.delete`. `auth.deleteAccount` restait pourtant appelable en HTTP par
  n'importe quel utilisateur connecté et archivait son parent, ses enfants et
  son profil personnel — une action destructrice qu'aucun écran n'exposait.
- **`registrations.applyCredit` cassait les deux invariants comptables du
  projet.** La procédure décrémentait `ParentCredit.amountRemaining`, créait une
  `CreditApplication` et poussait `paidAmount` jusqu'à `PAID` **sans écrire une
  seule écriture comptable** (FEC déséquilibré : un règlement sans contrepartie
  au 4191) **et sans `CreditNoteAllocation`** (TD-003 : l'avoir consommé restait
  réimputable par le FIFO). C'est exactement le chemin que le cadrage d'US-FACT-02
  avait refusé en août ; il était resté en place, sans appelant mais accessible à
  tout le personnel.
- **Un écran de paramétrage en double.** `/dashboard/admin/camp-types`
  dupliquait `/dashboard/admin/settings/camp-types` (seul écran présent dans la
  navigation) avec sa propre modale et ses propres colonnes — 631 lignes pour le
  même CRUD sur le même objet.
- **L'inscription en ligne des parents n'a jamais eu de serveur.** La page
  `/auth/signup/parent` postait vers `/api/auth/signup`, route inexistante
  absorbée par le catch-all NextAuth : le parcours échouait à tous les coups, et
  aucun lien n'y menait (TD-011).
- **Procédures redondantes retirées** : `settings.getAll` / `getByCategoryKey` /
  `getAsMap` / `update` (couvertes par `getByCategory`, `updateBulk` et
  `server/helpers/settings.ts`), `campTypes.list` — publique et non
  authentifiée — (couverte par `listAll` et `camps.listCampTypes`),
  `parents.getMe` (session NextAuth + `parents.getById`),
  `childDocuments.getById` (`list` renvoie les mêmes champs avec le même
  contrôle d'accès).
- **Garde d'accès `animatorProcedure`** (et son middleware `requireStaffRole`) :
  aucun routeur ne l'utilisait, et le rôle par permissions qu'elle préfigurait
  (EPIC-006) est abandonné depuis juin.
- **Deux requêtes serveur pour rien** : les pages de modification d'inscription
  (ADMIN et STAFF) chargeaient jusqu'à 100 camps et 100 parents à chaque
  ouverture pour alimenter deux props que le formulaire ne lit pas.
- **Deux composants partagés devenus orphelins** : `EmptyState` et
  `LoadingSpinner` n'étaient plus importés que par l'écran doublon supprimé.
- Divers : `formatDateTime`, type `PageSizeOption`, prop `currentStatus` de la
  modale de changement de statut, exports sans consommateur externe
  (`authConfig`, `getDashboardBasePathFromPathname`, helper de test `allTexts`),
  deux directives `eslint-disable` sans effet, un commentaire orphelin.

### Fixed — registre de dette : doublons périmés (2026-08-10)
- `docs/dette-technique.md` décrivait TD-006, TD-007 et TD-008 **deux fois** :
  une entrée `DONE` (correctifs livrés) et l'ancienne entrée `OPEN` restée en
  place. Les trois doublons obsolètes sont supprimés ; TD-010 (procédures sans
  écran) et TD-011 (auto-inscription) sont ajoutés.


### Added — TD-007 : le PDF d'avoir est enfin accessible (2026-08-10)
- **Le document existait, personne ne pouvait l'obtenir.** `CreditNotePDF` était
  complet et testé, mais sans procédure ni bouton. `creditNotes.generatePDF`
  reprend la chaîne de la facture (settings partagées, archivage Blob, `pdfUrl`
  mémorisé) et le PDF se télécharge depuis la fiche de l'avoir comme depuis la
  liste.
- **Montants au bon signe** : les montants d'un avoir sont stockés négatifs et
  le document pose lui-même le « - » — la procédure transmet des valeurs
  absolues, sans quoi le PDF aurait affiché `--12 000 XPF`.

### Fixed — TD-008 : l'envoi par email fonctionne (2026-08-10)
- **Deux boutons proposaient une action qui échouait à tous les coups.**
  `invoices.sendEmail` levait une `TRPCError` de code `'NOT_IMPLEMENTED' as any`
  — un code absent de l'énumération tRPC, que le `as any` cachait au
  compilateur. L'envoi est désormais réellement implémenté : la facture (ou le
  **devis**, tant qu'elle est en brouillon) part au parent avec son PDF en pièce
  jointe.
- **La pièce jointe ne peut pas diverger du PDF téléchargeable** : la génération
  est extraite dans un service partagé par les deux chemins.
- **Erreurs honnêtes** : environnement sans clé d'envoi → `PRECONDITION_FAILED`
  avec un message explicite ; client sans adresse → `BAD_REQUEST` ; refus du
  fournisseur → statut et motif remontés. `settings.isEmailConfigured` permet
  aux écrans de désactiver le bouton plutôt que de laisser l'utilisateur
  découvrir l'échec.

### Fixed — TD-006 : blobs orphelins (2026-08-10)
- **Un document supprimé restait téléchargeable.** `deleteFromStorage` n'était
  appelé nulle part : supprimer un document enfant, un document personnel ou le
  logo retirait la ligne en base sans supprimer le fichier, qui restait
  accessible par son URL publique — et facturé. Les trois chemins (plus le
  remplacement du logo) suppriment maintenant l'objet.
- **En best effort, dans le bon ordre** : la suppression métier fait autorité ;
  un store injoignable est tracé mais ne fait pas échouer l'opération, et ne
  ressuscite pas un document que l'utilisateur croit supprimé.

### Removed — passe de code mort (2026-08-10)

Passe complète du dépôt à la recherche de code sans appelant. **2 472 lignes de
code supprimées pour 36 ajoutées**, aucune modification de comportement : le
build, `tsc --noEmit`, les 969 tests unitaires et le rendu des 61 routes sont
inchangés.

- **15 fichiers sans aucun importeur supprimés** — 4 composants shadcn/ui jamais
  utilisés (`sheet`, `popover`, `breadcrumb`, `select-searchable`), l'îlot
  `camp-days-editor` + `camp-day-dialog` (deux fichiers qui ne s'importaient
  que l'un l'autre), `camps-cards` remplacé par `CampsTableClient`,
  `use-debounced-value` (doublon de `use-debounce`, seul utilisé),
  `lib/validation/{schemas,messages}`, `lib/constants/payment-methods`
  (supplanté par les méthodes en base), `lib/utils/registration-helpers`,
  `lib/trpc/cache-config` et `lib/rate-limit`.
- **Route de démonstration `/test/select-searchable` supprimée** : page de
  démo d'un composant, publiée en production **hors du middleware d'auth**.
- **3 procédures tRPC sans consommateur retirées** — `campTypes.getById`,
  `paymentMethods.getById` et surtout **`auth.verifyCredentials`**, mutation
  *publique* qui répondait « ce couple email/mot de passe est-il valide ? » à
  un appelant non authentifié. Elle était morte depuis que la vérification des
  identifiants est locale à `lib/auth/config.ts` (cf. CLAUDE.md § Auth
  simplifiée) ; elle restait exposée.
- **Exports morts retirés** — `usersColumns` (qui exécutait `getUsersColumns()`
  au chargement du module), `hasPermission` / `getCurrentRole` /
  `isAuthenticated` / `getSession` de `lib/auth`.
- **Dépendance `@radix-ui/react-popover` retirée** : plus aucun importeur après
  la suppression de `components/ui/popover`.
- **28 imports et variables inutilisés** nettoyés (66 → 38 avertissements
  ESLint, le reste étant les `any` de TD-001). ESLint ignore désormais les
  variables préfixées `_`, pour que l'idiome d'omission de clé ne masque plus
  les vrais rebuts.

### Fixed — remontées de la passe de code mort (2026-08-10)

- **Les erreurs de suppression d'un parent étaient invisibles côté STAFF.**
  `staff-parents-table-client` alimentait un état `error` qu'il n'affichait
  nulle part — repéré parce que la variable était en écriture seule. Le refus
  « Impossible de retirer le dernier parent d'un enfant » (TD-005) disparaissait
  donc silencieusement : la boîte de dialogue se fermait comme si tout s'était
  bien passé. L'`Alert` est désormais rendue, comme dans la vue ADMIN.

### Fixed — TD-004 : pied de page des PDF (2026-08-10)
- **Trois documents pouvaient écrire sous leur pied de page.** Le défaut
  remonté en recette sur la facture (US-FACT-01-bis) était structurel : le pied
  de page partagé est hors du flux, et seuls 2 des 5 documents lui réservaient
  sa place. `credit-note-pdf`, `staff-profile-pdf` et `attendance-list-pdf`
  réservent désormais la même hauteur — vérifié sur rendu réel : sans elle, la
  liste de présence enfouissait 18 lignes d'enfants sous le pied de page et
  l'avoir 14 blocs.
- **La contrainte n'est plus implicite** : la hauteur à réserver est exportée
  comme `PDF_FOOTER_RESERVED_SPACE` par le module du pied de page lui-même, au
  lieu d'être un `90` recopié de fichier en fichier.
- **Styles `footer` morts supprimés** dans les 4 documents qui les traînaient
  depuis l'époque d'avant le pied de page partagé : ils décrivaient une bande
  différente de la vraie et faussaient le diagnostic.
- **Tableaux plus robustes au saut de page** : lignes rendues insécables sur la
  facture, l'avoir et la liste de présence ; en-tête du tableau de présences
  répété sur chaque page, les pages suivantes n'affichant jusqu'ici que des
  colonnes de dates anonymes.

### Fixed — retours de recette (2026-08-10)
- **US-FACT-01-bis — le tableau des modes de règlement recouvrait le pied de
  page.** Au-delà de 4 règlements, le contenu de la facture coulait *sous* le
  `PDFFooter`, positionné en absolu : mesuré sur rendu réel, le bas du tableau
  tombait à y=43,5 pour 5 règlements, alors que la bande du pied de page monte
  jusqu'à y≈68. La page réserve désormais 90pt en bas (même correctif que
  US-UX-03 sur la fiche enfant) ; les lignes de règlement et le bloc des totaux
  sont insécables, et le titre de section entraîne au moins une ligne avec lui.
  Une facture chargée bascule donc sur une seconde page plutôt que de se
  superposer au pied de page.
- **US-FACT-02-bis — aucune facture ne s'affichait à la création d'un avoir.**
  Le formulaire demandait 500 factures alors que le routeur en plafonne 100 :
  Zod rejetait la requête et la liste se rendait vide, **sans le moindre
  message**, l'erreur de la query n'étant pas lue. La liste ne propose plus que
  les factures réellement éligibles (émise, payée, en retard) et affiche
  désormais l'erreur comme l'absence de facture éligible. `invoices.list`
  accepte pour cela un filtre multi-statuts `statuses`.
- **US-FAM-01 — suppression bloquée à tort pour un parent sans enfant.**
  L'invariant « un enfant a toujours au moins un parent » est porté par un
  trigger legacy de la base, que les tests mockés ne voient pas.
  `parents.delete` supprimait tous les liens du parent d'un bloc, ce que le
  trigger refuse dès qu'un enfant se retrouverait sans parent — y compris pour
  un enfant **archivé**, dont le lien survit au soft-delete alors que l'enfant
  n'est plus visible nulle part. Un tel lien ne bloque plus la suppression et
  est désormais conservé (le retirer violerait l'invariant) ; seuls les liens
  des enfants qui gardent un autre parent actif sont supprimés.
- **US-FAM-02 — erreur technique brute affichée à l'utilisateur.** Quand la
  suppression est légitimement refusée, le message nomme maintenant le ou les
  enfants concernés et indique quoi faire, au lieu de l'erreur Prisma. La
  vérification a lieu **avant** toute écriture, et l'erreur du trigger reste
  interceptée en filet de sécurité. Conformément aux scénarios de recette, la
  suppression du dernier parent d'un enfant actif est désormais **bloquée** —
  auparavant l'enfant était archivé silencieusement.

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
