# Changelog

Toutes les évolutions notables de ce projet sont documentées ici.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [Unreleased]

### Removed — sixième passe de code mort (2026-08-17)

Sixième passe complète. Les contrôles de la passe précédente sont rejoués
(exports et fichiers sans importateur, procédures tRPC sans appelant, modèles,
colonnes et énumérations Prisma, champs d'entrée jamais lus, `select` jamais
relus, états React jamais écrits, classes CSS, dépendances npm) et **cinq
contrôles nouveaux** sont ajoutés : props de composants qu'aucun appelant ne
passe, paramètres optionnels de fonctions qu'aucun appelant ne fournit,
exports exercés par les seuls tests, **routes `/api/*` appelées mais absentes
du dépôt**, et symboles exportés sans consommateur hors de leur module.
Outillage : `tsc --noUnusedLocals --noUnusedParameters` (propre), `pnpm lint`
(0 erreur), 979 tests verts.

Correction de méthode : les passes précédentes détectaient les procédures tRPC
par une indentation de deux espaces. `server/routers/staff-documents.ts` en
utilise quatre — ses quatre procédures n'avaient donc jamais été contrôlées.
`staffDocuments.getById` rejoint la table de TD-010 (seule procédure du dépôt
sans aucun appelant, pas même un test).

Ce qui part :

- **`components/parent/registration-form.tsx` : tout le contrôle d'âge.** Props
  `minAge` / `maxAge`, `checkAgeCompatibility()`, l'état `ageError` et son
  alerte. Aucun camp ne porte de bornes d'âge — ni `Camp` ni `CampDay` n'ont de
  colonne d'âge, la page appelante ne passait rien : la garde
  `minAge === undefined` sortait à chaque sélection d'enfant et le message
  « Le camp accepte les enfants de X à Y ans » n'a jamais pu s'afficher. Le
  besoin est enregistré en TD-024 ; `calculateAge()` reste, elle affiche
  « (N ans) » dans la liste des enfants.
- **`lib/pdf/shared/pdf-footer.tsx` : la prop `showPagination`.** Les cinq
  documents la laissaient à `true` ; la branche « sans pagination » — une
  cellule vide poussée dans la ligne méta — n'a jamais été rendue. Rendu
  strictement identique (vérifié par `test/unit/pdf-footer-overlap.spec.tsx`,
  qui mesure la mise en page réelle).
- **`components/ui/image-upload.tsx` : les props `accept` et `maxSize`.**
  Jamais positionnées par le seul écran qui monte le composant. Elles portent à
  la fois la validation et le texte affiché à l'utilisateur : configurables sans
  configurateur, elles n'offraient que la possibilité de les faire diverger.
  Devenues constantes de module, comme le `MAX_SIZE` de `document-upload.tsx`.
- **`components/shared/parent-multi-select.tsx` : la prop `error`** et le `<p>`
  qui l'affichait. Le seul appelant ne la passait pas ; les refus de saisie de
  ce composant partent déjà en toast.
- **`components/admin/credit-notes/credit-note-form.tsx` : la prop
  `redirectPath`.** Les deux écrans (ADMIN et STAFF) laissaient la valeur par
  défaut, qui se déduit déjà de l'espace courant via `useDashboardBasePath()`.
- **`server/helpers/invoice-number.ts` : l'alias `generateInvoiceNumber` et le
  paramètre `now`.** L'alias ne faisait que restreindre le type de `kind` avant
  de déléguer (6 appels réécrits sur `generateDocumentNumber`) ; le paramètre
  d'horloge n'a jamais été fourni par personne, pas même un test.
- **`lib/auth/config.ts` : `signIn` / `signOut` sortis de la destructuration.**
  Les deux écrans concernés sont des composants client et passent par
  `next-auth/react` — `lib/auth/index.ts` documentait déjà que les versions
  serveur n'avaient aucun appelant.
- **`lib/auth/auth.config.ts` : la page `newUser`.** NextAuth ne l'utilise qu'à
  la première connexion signalée par un adapter de base de données ; cette
  application n'en a pas (sessions JWT, provider `credentials`). Clé inerte, qui
  laissait croire à un parcours de première connexion inexistant.
- **`server/services/accounting.service.ts` : `deriveClientAux` devient
  privée.** Ses quatre appels vivent dans le fichier ; la règle de dérivation
  reste celle documentée dans CLAUDE.md.

### Documented — trois constats que la passe refuse de trancher seule (2026-08-17)

- **TD-025 — trois appels `/api/upload/*` sans route en face — P1.** Le
  téléversement du logo (`POST` et `DELETE` sur `/api/upload/logo`) et celui des
  documents d'enfant (`POST /api/upload/child-documents`) visent des routes qui
  n'existent dans **aucun commit** du dépôt : `app/api/` ne contient que `auth`,
  `generate/*` et `trpc`. Conséquences vérifiées : le logo de l'association ne
  peut pas être téléversé, aucun document d'enfant ne peut être créé
  (`childDocuments` n'a que `list` / `delete` / `count`), et les documents du
  personnel n'ont ni écran de dépôt ni procédure de création. Même motif que
  TD-011, en plus grave : ces écrans-là sont atteignables et mis en avant. Ni
  `pnpm smoke` ni `pnpm recette` ne couvrent un téléversement — c'est ce qui a
  permis au défaut de traverser deux mises en production. La correction est une
  livraison (routes + procédures + critères de recette), pas une suppression.
- **TD-024 — aucune borne d'âge sur un camp — P3.** Le code mort est parti (voir
  ci-dessus) ; le besoin, lui, reste : s'il faut borner les inscriptions par
  âge, cela se spécifie serveur d'abord (colonnes, saisie côté ACM, refus dans
  `registrations.create`), une validation qui ne vit que dans le navigateur ne
  protégeant rien.
- **TD-026 — quatre écrans dupliqués entre ADMIN et STAFF — P3.** Les tables
  « personnel » et « parents » existent en deux exemplaires quasi identiques
  (préfixe d'URL, noms de types, une action réservée à l'ADMIN). Rien n'y est
  mort — le défaut est celui de TD-022 : une correction s'applique à un
  exemplaire et pas à l'autre. Le dépôt a déjà de quoi s'en passer
  (`useDashboardBasePath()`, utilisé par seize fichiers) ; la fusion se fait
  écran par écran avec la recette rejouée, pas dans une passe de code mort.

### Fixed — sixième passe de code mort : un seed indispensable était injoignable (2026-08-16)

Passe complète après celles des 10, 11, 14 et 15 août. Mêmes axes rejoués sur
l'ensemble du dépôt — fichiers sans importeur, exports sans importateur,
procédures tRPC sans appelant, colonnes et **valeurs d'énumération** Prisma,
champs de schéma d'entrée jamais lus, props déclarées jamais lues, classes et
variables CSS, **valeurs de variantes `cva`**, dépendances npm, variables
d'environnement, fichiers au contenu identique — plus `knip` en contre-épreuve.

La trouvaille de la passe n'est pas du code mort mais son inverse :

- **`prisma/seed-payment-methods.ts` était injoignable, et il est
  indispensable.** Aucun script npm, aucune documentation, aucune référence :
  le seul moyen de le trouver était de lire le répertoire `prisma/`. Or
  `prisma/seed.ts` ne crée **aucun** moyen de paiement, et
  `credit-application.service.ts` lève un `PRECONDITION_FAILED` — « Méthode de
  règlement « Avoir » (CREDIT_NOTE) introuvable […] Appliquer le seed des
  méthodes de règlement » — dès qu'une facture est validée pour un client qui a
  des avoirs. L'application désignait donc un outil que le dépôt ne publiait
  pas. Câblé en `pnpm db:seed:payment-methods`, documenté dans
  `docs/deploiement.md` § Données de référence (avec la démarcation explicite
  entre les deux seeds), et l'en-tête du script dit maintenant ce qui casse sans
  lui.

### Removed — sixième passe de code mort (2026-08-16)

- **`@types/bcryptjs` (devDependency).** Le paquet publié sous ce nom en 3.0.0
  est un **stub déprécié** : `"main": ""`, aucune définition, et son propre
  champ `deprecated` dit « bcryptjs provides its own type definitions, so you do
  not need this installed ». Les types venaient déjà de `bcryptjs` lui-même.
  Retiré : `pnpm typecheck` reste propre, ce qui le prouve — sous `strict`, un
  module sans déclaration échouerait.
- **`signIn` / `signOut` dans `lib/auth/config.ts`.** La quatrième passe avait
  retiré leur réexport du barrel `lib/auth/index.ts` en constatant qu'aucun
  appelant n'existait ; la source, elle, continuait de les extraire de
  `NextAuth(authConfig)`. Les trois écrans concernés passent par
  `next-auth/react`. Reste `export const { handlers, auth } = …`.
- **Trois exports sans importateur devenus privés** : `deriveClientAux`
  (`accounting.service.ts` — ses quatre appels sont dans le fichier, et la
  convention CLAUDE.md veut une définition unique du code auxiliaire),
  `ButtonGroupProps` et `LoadingButtonProps` (composants écrits par le projet,
  pas repris de shadcn ; leurs cinq et six écrans appelants n'importent jamais
  le type).

### Documented — un constat que la passe refuse de trancher (2026-08-16)

- **TD-023 — 18 sous-composants de `components/ui/` ne sont rendus nulle part**
  (les neuf `DropdownMenuSub*` / `*RadioItem` / `*CheckboxItem`…, `SelectGroup`,
  `SelectLabel`, `SelectSeparator`, `DialogTrigger` et `DialogClose` — tous les
  dialogues du produit sont contrôlés —, `TableFooter`, `TableCaption`,
  `CardFooter`, `AvatarImage` : le produit n'a pas de photo de profil). Dix
  autres exports sont superflus alors que leur code vit à l'intérieur de son
  fichier. Non taillés : `components/ui/` est du code **fournisseur recopié**
  (shadcn/ui, `components.json` à la racine), qu'un `shadcn add` réécrit en
  entier. Le tree-shaking de Next les exclut déjà du bundle : la taille ne
  gagnerait rien à l'exécution et se perdrait à la première mise à jour.

**Ce que la passe confirme, chiffres à l'appui** — les 12 procédures tRPC sans
écran sont toujours exactement celles de TD-010 ; les colonnes Prisma jamais
lues sont exactement celles de TD-018 (les 39 autres « non référencées » sont
des relations inverses, obligatoires côté Prisma) ; **aucune** valeur
d'énumération Prisma n'est morte ; **aucun** champ de schéma d'entrée tRPC n'est
accepté sans être lu ; **aucune** prop déclarée n'est ignorée ; aucune classe ni
variable CSS orpheline ; aucun fichier dupliqué. Outillage : `tsc --noEmit
--noUnusedLocals --noUnusedParameters` propre, `pnpm lint` 0 erreur, 979 tests
verts.

### Removed — cinquième passe de code mort (2026-08-15)

Passe complète après celles des 10, 11 et 14 août. Contrôles rejoués sur
l'ensemble du dépôt : exports sans importateur, fichiers sans importeur,
**routes sans lien entrant**, procédures tRPC sans appelant, **modèles et
colonnes Prisma**, champs de schéma d'entrée jamais lus, `include` Prisma
jamais relus, états React jamais lus ou jamais écrits, classes CSS,
dépendances npm, code commenté. Outillage : `tsc --noUnusedLocals
--noUnusedParameters` (propre), `pnpm lint` (0 erreur), 979 tests verts.

**Ce que la passe confirme, chiffres à l'appui** — les 12 procédures sans écran
sont exactement celles de TD-010 (aucune dérive) ; les seuls modèles Prisma
inutilisés restent `Session` et `VerificationToken` (TD-015) ; **toutes** les
pages de `app/` ont un lien entrant, y compris celles atteintes par
`${basePath}/…` ; aucune dépendance npm n'est orpheline ; aucun composant de
`components/ui/` n'est sans importateur.

Ce qui restait, et qui part :

- **`middleware.ts` : la branche `/public` et son exclusion dans le `matcher`.**
  Next sert les fichiers de `public/` à la racine du site, jamais sous
  `/public` — et le dépôt n'a même pas ce dossier. Aucune URL n'a jamais
  emprunté ce chemin ; comportement strictement identique (les deux branches
  aboutissaient au même `NextResponse.next()`).
- **`next.config.ts` : le bloc `images`.** Il configure le pipeline
  d'optimisation de `next/image`, qu'**aucun** composant n'importe. Les deux
  seules images du produit sont le logo (balise `<img>` dans
  `components/ui/image-upload.tsx`) et les logos des PDF, rendus par `Image` de
  `@react-pdf/renderer` — ni l'un ni l'autre ne passe par ce pipeline.
- **`lib/constants/pagination.ts` : `MIN_PAGE_SIZE` et `MAX_PAGE_SIZE`.** Zéro
  lecture. Les bornes réelles sont écrites littéralement
  (`z.number().min(1).max(100)`) dans chaque schéma d'entrée tRPC paginé : la
  constante ne standardisait rien, elle le laissait croire. Les deux clés
  réellement lues (`DEFAULT_PAGE_SIZE`, `PAGE_SIZE_OPTIONS`) restent, avec le
  nom de leur lecteur en commentaire.
- **`components/layout/breadcrumbs.tsx` : les entrées `documents` et
  `accounting`.** Le fil d'Ariane traduit des segments d'URL ; aucun segment de
  `app/` ne porte ces deux noms, leur libellé n'a donc jamais pu être rendu.
- **30 exports sans importateur devenus privés au module.** Même défaut que
  celui traité à la main par la passe précédente sur deux symboles, ici traité
  en entier : types de props et de paramètres (`StatusBadgeProps`, `UserRow`,
  `PDFFooterProps`, `UploadOptions`, `SendEmailInput`, les cinq
  `Create*EntriesParams` de `accounting.service.ts`, etc.). Cas parlant : les
  types de colonnes **admin** (`AdminPaymentType`…) sont bien importés par
  leur table cliente, alors que leurs jumeaux **staff**
  (`StaffPaymentType`, `StaffRefundType`, `StaffCreditNoteType`) ne le sont
  pas — les tables staff redéclarent la forme sur place.

### Documented — trois constats que la passe refuse de trancher seule (2026-08-15)

- **TD-020 — `prisma/reset-data.sql`, script de purge orphelin.** Référencé
  nulle part, hors de la convention `prisma/migrations-manual/`, et surtout :
  son en-tête promet de conserver le compte admin, mais les étapes 11 et 12
  font `DELETE FROM parents;` et `DELETE FROM staff_members;` **sans `WHERE`**.
  Non supprimé — c'est de l'outillage d'exploitation, son sort se décide avec
  l'exploitant, pas dans une passe automatique.
- **TD-021 — `user.name` et `user.emailVerified` transportés pour personne** par
  `parents.list` / `parents.getById` / `staff.list` / `staff.getById`. Chargés,
  sérialisés, jamais affichés. Non retiré : c'est un contrat tRPC exposé au
  client, la relecture des consommateurs doit précéder la coupe.
- **TD-022 — douze implémentations locales du même formatage de date**, sous
  cinq noms, alors que `lib/utils.ts` en exporte une que seuls quatre fichiers
  utilisent. Aucune n'est morte ; le risque est la divergence.

### Removed — quatrième passe de code mort (2026-08-14)

Passe complète après celles des 10 et 11 août : graphe d'imports résolu sur les
alias `@/*` (y compris les `await import()` dynamiques), exports sans
consommateur, procédures tRPC sans appelant hors tests unitaires, props jamais
transmises, classes CSS, dépendances, variables d'environnement, colonnes du
schéma Prisma. Outillage de contrôle : `tsc --noUnusedLocals
--noUnusedParameters` (propre) et `pnpm lint` (0 erreur).

**Le dépôt est déjà largement propre** — aucun fichier n'est injoignable depuis
les racines Next/tests, et les 11 procédures sans écran trouvées sont
exactement celles déjà inventoriées par TD-010, sans dérive. Le mort restant
était en surface d'API, pas en fichiers :

- **`lib/trpc/index.ts` : réexport `trpc` supprimé.** Aucun des 70 composants
  qui utilisent le client React ne passait par le barrel — tous importent
  `@/lib/trpc/client`. Ce réexport remettait `@trpc/react-query` dans le graphe
  de chaque Server Component important `createServerTRPC` depuis le même barrel.
- **`lib/auth/index.ts` : réexports `signIn` / `signOut` supprimés.** Les deux
  écrans concernés sont des composants client et passent par `next-auth/react` ;
  les versions serveur n'ont jamais eu d'appelant.
- **`generateChildProfilePDFBuffer` supprimé** (`lib/pdf/child-profile-pdf.tsx`).
  La route `/api/generate/child-profile/[childId]` rend `ChildProfilePDF` en
  flux et n'a jamais appelé ce second chemin de rendu — comme les fiches
  personnel et feuilles de présence, qui n'en exposent pas. Le seul appelant
  était son test ; l'assertion de rendu bout en bout est conservée, elle appelle
  `renderToBuffer` directement.
- **Surface d'API réduite** : les alphabets de `lib/password-policy.ts`
  (`UPPER`, `LOWER`, `DIGITS`, `SYMBOLS`, `ALL`) et le type `CampType` de
  `components/admin/camps/camp-form.tsx` étaient exportés sans importateur.
  Devenus privés au module.

### Fixed — deux commentaires qui décrivaient un contrôle inexistant (2026-08-14)

`lib/password.ts` annonçait « Le serveur revalide la robustesse avant de
hacher » et `isPasswordStrong` se disait « Utilisé côté serveur ». Ni l'un ni
l'autre : la fonction n'a aucun appelant en production, et `staff.create`
n'applique que `z.string().min(8)`. Commentaires corrigés, écart consigné en
TD-019 — la fonction est conservée, elle est l'oracle des 14 assertions de
`test/unit/password.spec.ts`.

### Documented — trois constats non traitables par une passe automatique (2026-08-14)

- **TD-017** — `/dashboard/admin/users` est un îlot fermé : aucun lien entrant
  hors de lui-même. Ce n'est pas un doublon à supprimer — c'est le seul écran
  listant tous les comptes avec leur rôle, il porte le critère de recette vert
  `HAB-01` (Guide 8) et il est le seul consommateur de `users.create` /
  `users.update`. Le défaut est un lien de menu manquant, pas un écran de trop.
- **TD-018** — quatre colonnes du schéma jamais lues ni écrites, dont
  `accounting_entries.cancellation_entry_id` : la moitié base de données d'une
  traçabilité d'annulation comptable jamais branchée. Non supprimées pour la
  raison de TD-015 (un `db push` supprimerait la colonne).
- **TD-019** — voir ci-dessus.


### Fixed — TD-012 : le SIREN de l'export FEC part enfin dans le fichier (2026-08-11)
- **Un champ collecté puis jeté.** L'écran d'export affichait « SIREN
  (optionnel) », le transmettait à `fec.generateFEC`, et la procédure ne le
  lisait jamais. Le trésorier croyait le voir partir vers l'administration.
- **Nommage réglementaire rétabli** : le fichier sort désormais en
  `SIRENFECAAAAMMJJ.txt` (article A47 A-1 du LPF, AAAAMMJJ = date de fin de la
  période exportée), au lieu de `FEC_AAAAMMJJ_AAAAMMJJ.txt`.
- **Le SIREN se saisit une fois**, dans Paramètres → Comptabilité
  (`accounting.fec_siren`, 9 chiffres) ; le champ de l'écran d'export ne fait
  que le surcharger ponctuellement et s'y pré-remplit.
- **Un SIREN saisi mais illisible est refusé** (`BAD_REQUEST`) plutôt que
  silencieusement ignoré. Sans SIREN configuré, l'export **reste possible** sous
  le nom historique, et l'écran affiche le nom produit avec un avertissement de
  non-conformité : un export comptable ne se bloque pas pour un nommage.

### Fixed — TD-013 : statuts affichés en enum brut et couleurs non calibrées (2026-08-11)
- **`IMMEDIATE_REFUND` s'affichait tel quel** dans les deux tables de
  remboursement, alors que `<StatusBadge />` portait « Remboursement immédiat »
  sans jamais être appelé. `refund-details` en dupliquait un troisième mapping.
- **Les badges d'ACM contournaient les couleurs calibrées WCAG AA** via trois
  `getStatusBadge()` locaux identiques (couleurs Tailwind brutes, sans variante
  sombre) — colonnes admin, colonnes staff et fiche détail.
- Les six sites appellent maintenant `<StatusBadge />` ; les six helpers locaux
  sont supprimés. C'était le doublon qui était mort, pas la table partagée.
- **Libellés accentués** : `StatusBadge` affichait « Publie », « Payee »,
  « Remboursement immediat ». Les libellés — seules chaînes du fichier destinées
  à l'écran — sont accentués, ce qui corrige aussi les badges facture,
  inscription et présence.

### Removed — troisième passe de code mort (2026-08-11)

Passe complète après celles des 10 et 11 août : graphe d'imports, exports sans
consommateur, procédures tRPC sans appelant, routes sans lien, champs d'entrée
Zod jamais lus, paramètres et props morts, variables CSS, modèles et colonnes
Prisma, dépendances npm. Le gisement des deux premières passes est épuisé —
**aucun fichier orphelin, aucun export vraiment mort, aucune procédure sans
appelant** ne subsiste. Ce qui reste tient en 59 lignes :

- **`formatAmount` (`lib/utils.ts`)** : formateur XPF partagé que personne
  n'importait. Les 30 écrans qui affichent des montants ont chacun leur propre
  `Intl.NumberFormat` local — dont un homonyme dans
  `child-registrations-history.tsx` qui produit un format *différent*
  (`style: 'currency'` au lieu de `'decimal'` + suffixe).
- **`ISSUED` et `APPLIED` (`components/shared/status-badge.tsx`)** : deux
  statuts d'avoir « supportés au cas où un schéma enrichi serait introduit ».
  Ils n'existent ni dans l'enum `InvoiceStatus`, ni dans aucune migration : la
  fonction ne pouvait pas les recevoir. Retirés avec leurs utilitaires CSS
  (`.status-badge-issued`, `.status-badge-applied`) et le test qui les
  vérifiait.
- **Dix variables CSS `--status-*`** (`app/globals.css`, `:root` et `.dark`) :
  définies pour un système de badges par variables abandonné avant livraison au
  profit des utilitaires `.status-badge-*`. Aucun `var(--status-…)` dans le
  dépôt.
- **Paramètre `userId` d'`assertStaffAccess`** (`server/routers/staff-documents.ts`) :
  jamais lu — le contrôle porte sur `role` et `staffId`. Quatre appels
  transmettaient `ctx.user.id` pour rien.
- **Formulaire de réinitialisation de mot de passe en commentaire**
  (`app/auth/reset-password/page.tsx`) : bloc JSX mort. L'intention reste, elle,
  documentée dans le commentaire d'en-tête du fichier.

### Documented — ce que la passe a trouvé et n'a pas supprimé (2026-08-11)

Cinq constats où la suppression aurait été le mauvais geste. Détail et
résolution cible dans `docs/dette-technique.md`.

- **TD-012 — le champ SIREN de l'export FEC ne sert à rien.** L'écran le
  collecte, le formulaire le transmet, `fec.generateFEC` **ne le lit jamais** :
  le fichier s'appelle `FEC_AAAAMMJJ_AAAAMMJJ.txt` quoi qu'on saisisse. Un
  trésorier qui renseigne son SIREN croit légitimement qu'il part dans le
  fichier remis à l'administration. En arrière-plan, l'article A47 A-1 du LPF
  attend un nom `SIRENFECAAAAMMJJ.txt` : supprimer le champ ou le câbler sont
  deux décisions métier, pas des décisions de nettoyage.
- **TD-013 — les statuts métier ont une source de vérité que l'interface
  contourne.** Trois des sept tables de `StatusBadge` n'ont aucun appelant :
  `CAMP_MAP` (trois `getStatusBadge` locaux dupliqués, en couleurs Tailwind
  brutes hors des utilitaires calibrés WCAG AA), `REFUND_MAP` (les tables de
  remboursement affichent la valeur brute de l'enum — l'utilisateur lit
  `IMMEDIATE_REFUND`), `PAYMENT_MAP` (jamais affiché). Conservées : elles ne
  sont pas des cadavres mais la bonne moitié d'un affichage que l'application
  fait déjà, mal.
- **TD-014 — un second chemin vers la feuille de présence, sans lien.**
  `/dashboard/staff/camps/[id]/attendance` rend le même composant que l'onglet
  « Présences » de la fiche d'ACM. Aucun lien n'y mène ; seule la recette y
  accède en `page.goto` direct. Conservé parce que le supprimer casse un
  critère de recette vert, rejouable uniquement sur clone de prod.
- **TD-015 — `Session` et `VerificationToken`** ne sont lus ni écrits nulle
  part (NextAuth v5 en sessions JWT, sans adapter base). Conservés : retirer un
  modèle du schéma revient à supprimer la table au prochain `db push`.
- **TD-005 complété — `registrations.payment_status`.** Le dépôt ne l'écrit
  jamais ailleurs qu'à `UNPAID`, mais trois gardes refusent une opération quand
  il vaut `PAID`, et le deadlock observé en campagne smoke prouve que la valeur
  existe en base. Quelque chose hors du dépôt la pose. Les gardes n'ont donc
  **pas** été traitées comme du code mort — mais tant que le mécanisme n'est
  pas identifié, personne ne peut dire si elles protègent ce qu'elles croient.

Aucun changement de comportement : `tsc` propre, `pnpm lint` à 35 avertissements
(les `any` de TD-001, inchangés), 957 tests verts — un de moins, celui qui
vérifiait les deux statuts inatteignables. Les constats TD-012 et TD-013
documentés ci-dessus sont résolus par le correctif décrit plus haut.

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
