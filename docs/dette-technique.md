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

## TD-004 — Trois PDF partagent le pied de page sans réserver sa place — P3 — DONE (2026-08-10)

**Constat (2026-08-10, US-FACT-01-bis)** : `PDFFooter` est en
`position: absolute` (`bottom: 16`) et occupe ~70pt une fois les coordonnées et
la mention légale rendues. Une page ne lui laisse la place que si elle porte un
`paddingBottom` supérieur à cette hauteur. Deux documents le faisaient
(`child-profile-pdf` depuis US-UX-03, `invoice-pdf` depuis US-FACT-01-bis) ;
**trois ne le faisaient pas** : `credit-note-pdf`, `staff-profile-pdf`,
`attendance-list-pdf`.

**✅ Résolu** :

1. La contrainte n'est plus implicite : `PDF_FOOTER_RESERVED_SPACE` (90pt) est
   exportée par `lib/pdf/shared/pdf-footer.tsx`, à côté du composant qui la
   crée, et les **cinq** documents la déclarent.
2. Les styles `footer` morts, hérités d'avant le pied de page partagé, sont
   supprimés des 4 fichiers qui les traînaient — ils désignaient une bande
   différente de la vraie et égaraient le diagnostic.
3. Les lignes de tableau des documents concernés sont rendues insécables
   (`wrap={false}`), l'en-tête du tableau de présences est `fixed` pour être
   répété sur chaque page — sans quoi les pages suivantes affichaient des
   colonnes de dates anonymes.

**Verrou** : `test/unit/pdf-footer-overlap.spec.tsx` rend les 5 documents avec
assez de contenu pour remplir la page, relit la position réelle de chaque bloc
de texte dans le PDF produit (`test/helpers/pdf-layout.ts`) et vérifie qu'aucun
contenu ne s'écrit dans la bande du pied de page. La bande est **mesurée sur le
rendu**, pas déduite de la constante : réduire la réserve fait échouer le test
au lieu de rétrécir la zone contrôlée. Vérifié par mutation — réserve
neutralisée, 4 documents sur 5 échouent, dont la facture sur le symptôme exact
remonté en recette (« MODES DE RÈGLEMENT » à y=52,9, sous un pied de page dont
la ligne haute est à y=61,7).

**Limite connue** : un test d'arbre React ne peut pas détecter ce défaut, qui
n'existe qu'après calcul de mise en page. Tout nouveau document PDF doit donc
être ajouté à ce spec, faute de quoi il n'est pas couvert.

## TD-006 — Blobs orphelins : `deleteFromStorage` jamais appelé — P2 — DONE (2026-08-10)

**Constat (2026-08-10)** : `lib/storage/blob-storage.ts` exportait
`deleteFromStorage` sans qu'aucun appelant ne l'utilise. Toute suppression d'un
document enfant, d'un document personnel ou du logo retirait la ligne en base
sans supprimer l'objet correspondant sur Vercel Blob. Le remplacement du logo
avait le même effet.

**Risque** : les fichiers restaient **accessibles par leur URL publique après
leur suppression fonctionnelle** (un certificat médical « supprimé » reste
lisible de quiconque a gardé le lien) — et continuaient d'être facturés.

**✅ Résolu (2026-08-10)** :
- `deleteFromStorageBestEffort(url, contexte)` ajouté au module de stockage :
  supprime l'objet, **avale** l'erreur du store (log `console.error`) et
  retourne un booléen. La suppression métier fait autorité — un store
  injoignable ne doit pas ressusciter un document que l'utilisateur a supprimé,
  et l'ordre inverse (blob d'abord) laisserait une ligne pointant vers le vide.
- Câblé dans `childDocuments.delete`, `staffDocuments.delete`,
  `settings.deleteLogoUrl` et `settings.setLogoUrl` (ancien logo remplacé, sauf
  ré-enregistrement de la même URL).
- `deleteFromStorage` échoue désormais explicitement si `BLOB_READ_WRITE_TOKEN`
  est absent, comme `uploadToStorage` le faisait déjà.
- Tests : `test/unit/blob-storage.spec.ts` (contrat best-effort) et couverture
  des trois chemins d'appel dans les specs des routers concernés.

**Reste (action d'exploitation)** : les blobs déjà orphelins d'avant ce
correctif ne sont pas rattrapés par le code — inventaire et purge à faire une
fois sur le store.

## TD-007 — PDF d'avoir complet mais non câblé — P2 — DONE (2026-08-10)

**Constat (2026-08-10)** : `lib/pdf/credit-note-pdf.tsx` était complet, corrigé
par TD-004 et couvert par `pdf-footer-overlap.spec.tsx`, mais aucun point
d'entrée ne l'appelait : ni procédure tRPC, ni bouton. Une fonctionnalité prête
à 90 %, pas de la dette à jeter.

**✅ Résolu (2026-08-10)** :
- `creditNotes.generatePDF` (staff) reprend la chaîne de `invoices.generatePDF` :
  settings PDF partagées, rendu, archivage sur le store Blob sous
  `credit-notes/{numéro}-{id}.pdf`, `pdfUrl` mémorisé sur la ligne.
- **Signe des montants** : les montants d'un avoir sont stockés négatifs alors
  que le document pose lui-même le « - » devant chaque valeur — la procédure
  transmet donc des valeurs absolues, sinon le PDF afficherait `--12 000 XPF`.
  Un test verrouille ce point.
- Un avoir autonome (sans facture d'origine) affiche « Aucune » en face de
  « Facture concernée » plutôt qu'un champ vide.
- UI : bouton « Télécharger le PDF » sur la fiche de l'avoir et entrée
  correspondante dans le menu de la liste — PDF déjà archivé ouvert directement,
  généré à la volée sinon (même comportement que la facture).

## TD-008 — `invoices.sendEmail` levait une erreur inexistante — P1 — DONE (2026-08-10)

**Constat (2026-08-10)** : la procédure levait inconditionnellement une
`TRPCError` de code `'NOT_IMPLEMENTED' as any` — code absent de l'énumération
tRPC, d'où le `as any` qui masquait le problème au compilateur. Elle n'était pas
morte : **deux boutons visibles** l'appelaient (« Envoyer par email » sur la
fiche facture, « Envoyer le devis » dans la liste). L'application proposait donc
une action qui échouait à tous les coups.

**✅ Résolu (2026-08-10)** :
- `server/services/email.service.ts` — envoi transactionnel via l'API REST de
  Resend (`fetch`, aucun SDK dans le bundle serverless). La **clé** vient de
  l'environnement (`RESEND_API_KEY`, comme tout secret), l'**identité
  d'expédition** des settings `email` déjà administrables.
- `server/services/invoice-pdf.service.ts` — la génération du PDF de facture est
  extraite du router pour que l'envoi joigne **exactement** le document
  téléchargeable (même requête, même rendu, même objet archivé).
- `invoices.sendEmail` envoie la facture — ou le **devis**, tant qu'elle est en
  brouillon — au parent, PDF en pièce jointe, et retourne le destinataire.
  Erreurs typées : `PRECONDITION_FAILED` si l'environnement n'a pas de clé,
  `BAD_REQUEST` si le client n'a pas d'adresse, `INTERNAL_SERVER_ERROR` avec le
  statut et le corps renvoyés par le fournisseur.
- `settings.isEmailConfigured` expose l'état de configuration (booléen +
  adresse d'expédition, aucun secret) : le bouton de la fiche est désactivé et
  la boîte de dialogue de la liste explique l'indisponibilité au lieu de laisser
  l'envoi échouer.

**Prérequis d'exploitation** : renseigner `RESEND_API_KEY` sur Vercel et
vérifier le domaine d'envoi côté Resend (voir `docs/deploiement.md`). Sans
cela, l'application ne casse pas — elle dit que l'envoi est indisponible.

## TD-012 — Le SIREN de l'export FEC était collecté puis jeté — P2 — DONE (2026-08-11)

**Constat (2026-08-11)** : l'écran d'export FEC affichait un champ « SIREN
(optionnel) », le formulaire le transmettait à `fec.generateFEC`, la procédure
l'acceptait dans son schéma Zod… et ne le lisait jamais. Un trésorier qui le
renseignait croyait qu'il partait dans le fichier remis à l'administration.
Conséquence : le fichier sortait sous le nom `FEC_AAAAMMJJ_AAAAMMJJ.txt`, là où
l'article A47 A-1 du LPF attend `SIRENFECAAAAMMJJ.txt` (AAAAMMJJ = date de
clôture de l'exercice).

**Arbitrage** : câbler plutôt que supprimer — le nommage est une exigence
réglementaire, pas un confort. Retirer le champ aurait supprimé le symptôme en
laissant l'export non conforme.

**Résolution livrée** :
- `accounting.fec_siren` ajouté aux paramètres (onglet Comptabilité, validé à
  9 chiffres, seedé vide). Le SIREN est un attribut de l'organisation : le
  trésorier ne le ressaisit plus à chaque export.
- `getFecSiren()` / `normalizeSiren()` dans `server/helpers/settings.ts`.
  `normalizeSiren` tolère les séparateurs de lisibilité et la valeur
  JSON-stringifiée écrite par `settings.updateBulk`.
- `fec.generateFEC` : SIREN saisi > SIREN des settings ; nomme le fichier
  `SIRENFECAAAAMMJJ.txt` à partir de la date de fin ; **rejette** (BAD_REQUEST)
  un SIREN saisi mais illisible plutôt que de produire un fichier mal nommé ;
  renvoie `siren` pour que l'écran dise ce qui a réellement servi.
- Sans SIREN nulle part, l'export **reste possible** sous le nom historique et
  l'écran affiche le nom produit + un avertissement de non-conformité. Un
  export bloqué serait pire qu'un export mal nommé.

**Ce que le SIREN ne fait pas** : il n'entre pas dans le contenu du fichier —
les 18 colonnes du FEC ne comportent pas ce champ. Ne pas l'ajouter à
`generateFECContent`.

## TD-013 — Statuts affichés en enum brut et couleurs non calibrées — P3 — DONE (2026-08-11)

**Constat (2026-08-11)** : `<StatusBadge />` centralise label français, couleur
calibrée WCAG AA (utilities `status-badge-*`) et icône pour chaque statut métier
— mais trois de ses tables n'avaient aucun appelant, alors que l'affichage
correspondant existait ailleurs, fait à la main et moins bien :
- les deux tables de remboursement (admin + staff) affichaient `IMMEDIATE_REFUND`
  tel quel à l'utilisateur, alors que `REFUND_MAP` portait le libellé français ;
- `refund-details.tsx` dupliquait ce mapping en local (`refundMethodLabels`) ;
- les trois affichages de statut d'ACM (colonnes admin, colonnes staff, fiche
  détail) recopiaient chacun un `getStatusBadge()` local avec des couleurs
  Tailwind brutes (`bg-green-100`…), contournant les couleurs calibrées et le
  mode sombre.

**Résolution livrée** : les six sites appellent `<StatusBadge />`. Les six
helpers/tables locaux sont supprimés — c'était le doublon qui était mort, pas la
table partagée.

**Effet de bord assumé** : les libellés de `StatusBadge` portaient des lettres
non accentuées (« Publie », « Payee », « Remboursement immediat »). Rebrancher
les badges d'ACM dessus aurait dégradé un affichage jusque-là accentué : les
libellés — seules chaînes de ce fichier destinées à l'écran — ont donc été
accentués, ce qui corrige du même coup les badges facture, inscription et
présence. Commentaires et identifiants restent en ASCII.

## TD-005 — Trigger legacy « dernier parent » absent du dépôt — P2 — OPEN

**Constat (2026-08-10, US-FAM-01/02)** : l'invariant « un enfant a toujours au
moins un parent » est appliqué par un trigger PostgreSQL sur `children_parents`
qui **n'existe nulle part dans le dépôt** (héritage de la base d'origine,
antérieur à la refonte). Les tests unitaires étant mockés, aucun d'eux ne le
voit : `parents.delete` a pu être livré avec un chemin d'écriture que la base
refuse systématiquement, découvert seulement en recette.

**Risque** : d'autres triggers/CHECK legacy peuvent subsister et invalider du
code qui passe tous les tests. La règle métier elle-même n'est ni documentée ni
versionnée.

**Résolution cible** : inventorier les triggers et contraintes réellement
présents sur un clone de prod (`pg_trigger`, `pg_constraint`), les transcrire
dans `prisma/migrations-manual/` pour trace, et décider pour chacun s'il reste
en base ou passe en garde applicative — la convention du projet étant « plus de
triggers SQL » (voir CLAUDE.md).

**Second candidat repéré (2026-08-11, troisième passe de code mort)** :
`registrations.payment_status`. Le dépôt ne l'écrit **jamais** ailleurs qu'à
`'UNPAID'` (valeur par défaut, création d'inscription, remise à zéro à la
suppression d'une facture) — pourtant trois gardes de `server/routers/registrations.ts`
refusent une opération quand il vaut `'PAID'` (modification, changement de
statut, suppression d'une inscription payée). Le commentaire de la deuxième
garde renvoie à un **deadlock observé en campagne smoke du 2026-07-06** : la
valeur `PAID` existe donc bel et bien en base. Quelque chose hors du dépôt la
pose. Ces trois gardes n'ont **pas** été traitées comme du code mort par cette
passe, précisément pour cette raison — mais tant que le mécanisme n'est pas
identifié, personne ne peut dire si elles protègent ce qu'elles croient
protéger. À inclure dans l'inventaire ci-dessus.

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

## TD-009 — Aucune limitation de débit sur les endpoints d'authentification — P2 — OPEN

**Constat (2026-08-10, passe de code mort)** : `lib/rate-limit.ts` fournissait
`checkRateLimit` / `resetRateLimit` depuis l'origine du dépôt **sans un seul
appelant**. Le module a été supprimé lors de la passe de code mort, pour deux
raisons : il n'a jamais protégé quoi que ce soit, et son implémentation — une
`Map` en mémoire de processus — ne peut pas fonctionner sur Vercel, où chaque
invocation de fonction serverless peut démarrer un conteneur neuf.

Le manque qu'il ne comblait pas, lui, subsiste : `/api/auth/*` (NextAuth) et les
procédures publiques n'ont **aucune limitation de débit**. Le bruteforce de mot
de passe n'est freiné que par le coût bcrypt (12 tours).

**Résolution cible** : limitation de débit à état partagé — Vercel Firewall /
rate limiting de la plateforme, ou compteur en base (une table `login_attempts`
indexée sur email + IP). Ne pas réintroduire de compteur en mémoire de processus.

## TD-010 — Procédures tRPC sans écran : la moitié serveur de fonctions jamais construites — P3 — OPEN

**Constat (2026-08-10, deuxième passe de code mort)** : après le retrait des
procédures redondantes, **11 procédures tRPC n'ont toujours aucun appelant** —
ni page, ni composant, ni campagne de test réel. Elles n'ont pas été supprimées
parce qu'aucune autre procédure ne couvre leur besoin : ce sont des fonctions
dont seule la moitié serveur a été écrite. Les supprimer ferait disparaître la
trace du manque ; les garder sans les tracer laisse croire qu'elles servent.

| Procédure | Écran manquant |
|-----------|----------------|
| `invoices.updateStatus` | passage manuel en `OVERDUE` / `CANCELLED` — seule implémentation de la table de transitions documentée dans CLAUDE.md |
| `camps.delete` | suppression d'un camp (la liste ne propose que dupliquer / modifier) |
| `payments.statistics` | tableau de bord d'encaissement |
| `fec.getEntries`, `fec.getStats` | consultation du journal comptable à l'écran (seul l'export existe) |
| `parents.update` | modification par le parent de sa propre fiche (seul `updateByStaff` est câblé) |
| `campTypes.toggleActive`, `paymentMethods.toggleActive` | activer/désactiver depuis les écrans de paramétrage — voir ci-dessous |
| `attendances.list` | vue des présences côté PARENT (le pointage STAFF passe par `getGridForCamp`) |
| `attendances.delete`, `attendances.getStatistics` | correction d'un pointage, statistiques de présence |
| `registrations.getAvailableCredits` | affichage des avoirs disponibles (seul `pnpm smoke` l'appelle) |

**Point d'attention immédiat** : les deux écrans de paramétrage
(`/dashboard/admin/settings/camp-types` et `.../payment-methods`) affichent
l'état actif/inactif en badge mais n'offrent **aucune action pour le changer**.
Le seul écran qui savait le faire pour les types d'ACM était l'écran doublon
`/dashboard/admin/camp-types`, supprimé par cette passe car absent de toute
navigation. Rebrancher l'action « activer / désactiver » sur les deux tables de
paramétrage est un correctif d'une demi-journée — et il vaut mieux le faire que
laisser vivre deux écrans concurrents pour le même objet.

**Résolution cible** : pour chaque ligne, trancher avec le PO — construire
l'écran, ou supprimer la procédure. Toute procédure exposée sans écran reste
appelable en HTTP par un utilisateur authentifié : ce n'est pas du code inerte.

## TD-011 — L'auto-inscription des parents n'a jamais eu de serveur — P3 — OPEN

**Constat (2026-08-10, deuxième passe de code mort)** : la page
`/auth/signup/parent` et son formulaire (442 lignes, validation complète,
connexion automatique après création) envoyaient leur `POST` à
`/api/auth/signup` — **une route qui n'existe pas dans le dépôt**. L'URL tombe
dans le catch-all NextAuth `/api/auth/[...nextauth]`, qui ne connaît pas cette
action : le parcours échouait donc systématiquement. Aucun lien de
l'application ne menait à cette page ; aucune procédure ni migration ne prévoit
la création d'un compte PARENT en libre-service.

Page et formulaire ont été supprimés : un écran public qui ne peut pas aboutir
est un piège pour l'utilisateur qui tomberait sur l'URL, pas une fonctionnalité
en attente.

**Résolution cible** : si l'ALVM veut l'inscription en ligne des familles, elle
se spécifie comme une US à part entière (qui crée le compte ? avec quelle
vérification d'email ? quelle validation par le secrétariat ?) et elle
s'implémente serveur d'abord. Aujourd'hui, les comptes parents sont créés par
le personnel via `parents.create` / `parents.createByStaff`.

## TD-016 — « Mon Profil » : un menu qui promettait un écran inexistant — P3 — OPEN

**Constat (2026-08-12, retour de recette)** : le menu avatar de
`DashboardHeader` proposait deux entrées vers des routes absentes de `app/` —
« Mon Profil » (`/dashboard/profile`) et « Paramètres » (`/dashboard/settings`,
le seul écran réel étant `/dashboard/admin/settings`). Le header étant rendu par
`app/dashboard/layout.tsx`, les **trois rôles** cliquaient sur un 404. Aggravant :
aucun `not-found.tsx` n'existait dans le dépôt, si bien que la vingtaine de pages
de détail qui appellent `notFound()` (identifiant inconnu) éjectaient elles aussi
l'utilisateur sur la page blanche par défaut de Next, hors du shell applicatif et
sans chemin de retour.

**Correctif livré** : entrée « Mon Profil » retirée ; « Paramètres » réservée aux
ADMIN et pointée sur `/dashboard/admin/settings` ; ajout de `app/not-found.tsx`
(URL non appariées — Next n'utilise que le fichier racine pour ce cas) et de
`app/dashboard/not-found.tsx` (appels à `notFound()`, rendu dans le shell).
Verrou : `test/unit/dashboard-header.spec.tsx`.

**Ce qui reste ouvert — le manque, pas le lien** : il n'existe aucun moyen pour un
utilisateur de consulter ou modifier son propre compte. `users.update` et
`users.resetPassword` sont des procédures admin/staff ; aucune procédure `me.*`
n'existe. Un parent ne peut donc ni corriger son téléphone, ni changer son mot de
passe sans passer par le secrétariat. Retirer l'entrée de menu supprime le piège,
pas le besoin.

**Résolution cible** : une US « mon compte » spécifiée serveur d'abord —
procédures self-service explicitement bornées au `ctx.session.user.id` (jamais un
`users.update` relâché), puis l'écran `/dashboard/profile` pour les trois rôles.

## TD-014 — Un second chemin vers la feuille de présence, sans lien — P3 — OPEN

**Constat (2026-08-11, troisième passe de code mort)** : la route
`/dashboard/staff/camps/[id]/attendance` rend `AttendancePageClient` — le même
composant que l'onglet « Présences » de la fiche d'ACM
(`components/camps/camp-attendance-tab.tsx`), atteignable lui par
`/dashboard/staff/camps/[id]?tab=presences`. **Aucun lien de l'application ne
mène à la route autonome** : seule la recette visuelle y accède, en `page.goto`
direct (`PRES-01`), justement parce qu'elle n'est pas navigable.

C'est le même motif que l'écran doublon `/dashboard/admin/camp-types` supprimé
par la passe précédente, à une différence près : celui-ci est le support d'un
critère de recette vert. Le supprimer casse `pnpm recette`, qui ne peut être
rejouée que sur un clone de prod — hors de portée d'une passe automatique.

**Résolution cible** : pointer `PRES-01` sur
`/dashboard/staff/camps/${campId}?tab=presences`, supprimer la route autonome,
et avec elle la prop `showHeader` d'`AttendancePageClient` (elle n'existe que
pour distinguer les deux chemins) ainsi que l'entrée `attendance` de
`segmentLabels` dans `components/layout/breadcrumbs.tsx`. À faire dans une
livraison où la recette est rejouée.

## TD-015 — Deux modèles NextAuth jamais utilisés en base — P3 — OPEN

**Constat (2026-08-11, troisième passe de code mort)** : les modèles Prisma
`Session` et `VerificationToken` ne sont lus ni écrits par une seule ligne du
dépôt. C'est cohérent : NextAuth v5 est configuré en sessions **JWT**, sans
adapter de base de données — la session vit dans le cookie, pas dans une table.
`Account` reste utilisé (il porte le mot de passe haché des identifiants).

**Non supprimés** : retirer un modèle du schéma revient à supprimer la table au
prochain `db push`, et le projet interdit explicitement `prisma migrate dev` sur
Neon (CLAUDE.md). Deux tables vides ne coûtent rien ; une suppression de table
mal séquencée, si.

**Résolution cible** : les retirer du schéma lors d'une opération de migration
déjà planifiée, après avoir vérifié sur clone de prod qu'elles sont bien vides,
et en conservant la trace SQL dans `prisma/migrations-manual/`.

## TD-017 — L'écran d'habilitations existe, la navigation l'ignore — P2 — OPEN

**Constat (2026-08-14, quatrième passe de code mort)** : `/dashboard/admin/users`
et ses trois sous-routes (`new`, `[id]`, `[id]/edit`) forment un **îlot fermé**.
Les seuls liens entrants viennent de l'îlot lui-même — la table renvoie vers
`[id]/edit`, `new` et `[id]/edit` renvoient vers la liste. Aucune entrée de
`dashboard-sidebar.tsx`, aucun lien d'une autre page n'y mène. `[id]/page.tsx`
n'est même atteignable depuis l'intérieur (les colonnes ne pointent que sur
`/edit`).

**Pourquoi ce n'est PAS du code mort, et pourquoi il ne fallait pas le supprimer** :

1. C'est le seul écran qui liste **tous les comptes avec leur rôle**. Les deux
   écrans câblés dans le menu (`users/parents`, `users/staff`) sont chacun
   bornés à un rôle : aucun ne répond à « qui a accès, et à quel titre ».
2. Il porte un critère de recette **vert** — `HAB-01` (Guide 8, gestion des
   accès et habilitations) fait `page.goto('/dashboard/admin/users')` et vérifie
   la présence des rôles. Comme pour TD-014, le supprimer casserait `pnpm
   recette`, qui ne se rejoue que sur clone de prod.
3. `users.create` et `users.update` n'ont **aucun autre écran** : les parcours
   parents et personnel passent par leurs propres formulaires. Les supprimer
   ferait tomber deux procédures de plus dans TD-010.

Le défaut réel n'est donc pas un écran de trop, c'est un **lien qui manque** —
même motif que TD-016 (« Mon Profil ») : la navigation et les écrans ont divergé.

**Résolution cible** : ajouter l'entrée « Habilitations » (ou « Comptes ») dans
la section Administration de `dashboard-sidebar.tsx`, pointée sur
`/dashboard/admin/users`, et faire pointer les colonnes vers `[id]` (fiche) en
plus de `[id]/edit`. Décision d'intitulé à trancher avec le PO — c'est ce qui a
retenu cette passe, pas la difficulté technique. Tant que le lien n'existe pas,
l'écran reste inatteignable pour un utilisateur qui ne connaît pas l'URL.

**À noter** : cet écran est aussi le dernier consommateur de
`components/ui/data-table.tsx` (variante non paginée) et de
`components/admin/users/users-table-columns.tsx`. Le reste de l'application est
passé à `DataTableServer`. Le jour où l'écran est repris, l'aligner.

## TD-018 — Colonnes jamais lues ni écrites par le dépôt — P3 — OPEN

**Constat (2026-08-14, quatrième passe de code mort)** : au-delà des deux
modèles de TD-015, quatre **colonnes scalaires** du schéma Prisma n'apparaissent
dans aucune requête, aucun mapper, aucun test, aucun script :

| Colonne | Modèle | Remarque |
|---------|--------|----------|
| `max_capacity_override` | `CampDay` | capacité par jour jamais surchargée — la capacité vient de `Camp.maxCapacity` |
| `cancellation_entry_id` | `AccountingEntry` | avec sa relation `CancellationLink` ; `cancelAccountingEntries()` annule sans relier l'écriture de contrepassation à l'écriture annulée |
| `allocation_date` | `CreditNoteAllocation` | `@default(CURRENT_DATE)` — écrite par la base, jamais relue |
| `refresh_token`, `access_token`, `token_type`, `id_token`, `session_state` | `Account` | colonnes OAuth du modèle NextAuth ; seul le provider `credentials` est configuré |

`cancellation_entry_id` mérite d'être regardé avant d'être supprimé : c'est la
moitié base de données d'une **traçabilité d'annulation comptable** qui n'a
jamais eu sa moitié applicative. Au FEC, on sait aujourd'hui qu'une écriture a
été contrepassée, pas *par laquelle*. C'est un manque, pas un rebut — le même
motif que TD-010 côté procédures.

**Non supprimées, pour la raison de TD-015** : retirer un champ du schéma
supprime la colonne au prochain `db push`, et le projet interdit
`prisma migrate dev` sur Neon (CLAUDE.md).

**Résolution cible** : trancher `cancellation_entry_id` avec la comptabilité
(brancher la traçabilité, ou acter qu'on s'en passe) ; pour les autres, les
retirer lors d'une migration déjà planifiée, après vérification sur clone de
prod qu'elles sont vides, trace SQL dans `prisma/migrations-manual/`.

## TD-019 — `isPasswordStrong` : le contrôle serveur annoncé n'existe pas — P2 — OPEN

**Constat (2026-08-14, quatrième passe de code mort)** : `isPasswordStrong()`
(`lib/password-policy.ts`) n'a **aucun appelant en production**. Seul
`test/unit/password.spec.ts` l'exerce, comme oracle des deux générateurs.

Ce qui rend le constat sérieux, ce n'est pas la fonction inutilisée : ce sont
les deux commentaires qui affirmaient le contraire. `lib/password.ts` annonçait
« Le serveur revalide la robustesse avant de hacher » et la fonction elle-même
se disait « Utilisé côté serveur pour valider la robustesse d'un mot de passe
généré par le navigateur ». En réalité `staff.create` n'applique que
`z.string().min(8)` — la contrainte de saisie manuelle. Un lecteur du code
croyait donc à un contrôle qui n'a jamais été branché.

**Traité par cette passe** : les deux commentaires ont été corrigés et pointent
ici. La fonction est **conservée** — c'est la seule définition exécutable de la
politique de génération et le socle de 14 assertions.

**Ce qui reste ouvert** : décider si le mot de passe fabriqué par le navigateur
(US-PERS-01) doit être revalidé côté serveur. Attention au piège en le
branchant : la politique de saisie manuelle est **volontairement** plus
permissive (8 caractères, cf. `lib/password-policy.ts`). Appliquer
`isPasswordStrong` à toutes les entrées rejetterait des mots de passe que
l'application accepte aujourd'hui à dessein. Le branchement correct ne vise que
le champ alimenté par le générateur, pas la saisie libre.

## TD-020 — `prisma/reset-data.sql` : script de purge orphelin qui ment sur ce qu'il garde — P2 — OPEN

**Constat (2026-08-15, cinquième passe de code mort)** : `prisma/reset-data.sql`
vide 17 tables. Il n'est référencé **nulle part** — ni `package.json`, ni
`docs/deploiement.md`, ni CLAUDE.md, ni aucun script. Il est aussi hors de la
convention du dépôt : le SQL manuel vit dans `prisma/migrations-manual/`
(`docs/deploiement.md` § procédure de migration).

**Pourquoi c'est plus qu'un fichier oublié** : son en-tête annonce
« Conserve : compte admin (admin@alvm.nc), app_settings, payment_methods,
camp_types », et deux de ses étapes contredisent cette promesse —

| Étape | Commentaire | Instruction réelle |
|-------|-------------|--------------------|
| 11 | « Parents (profils) — sauf admin » | `DELETE FROM parents;` — sans `WHERE` |
| 12 | « Staff members — sauf admin » | `DELETE FROM staff_members;` — sans `WHERE` |

Seules les étapes 14 (`accounts`, `users`) portent réellement le garde-fou sur
`admin@alvm.nc`. Un opérateur qui fait confiance à l'en-tête garde donc un
compte admin **sans profil** `staff_members`. Le script purge par ailleurs
`sessions` et `verification_tokens`, les deux tables que TD-015 constate vides
et non utilisées.

**Non supprimé** : c'est de l'outillage d'exploitation, et le supprimer retire
une capacité (remise à zéro d'un clone) sans la remplacer. Une passe de code
mort n'a pas à trancher seule le sort d'un outil d'ops.

**Résolution cible** : décider avec l'exploitant — soit le script sert, et il
descend dans `prisma/migrations-manual/` avec ses deux `WHERE` manquants et une
mention dans `docs/deploiement.md` ; soit il ne sert plus et il part. Dans les
deux cas, ne jamais le jouer ailleurs que sur un clone (cf. la règle des
campagnes `pnpm smoke` / `pnpm recette`).

## TD-021 — Deux colonnes traversent le réseau sans jamais être affichées — P3 — OPEN

**Constat (2026-08-15, cinquième passe de code mort)** : `parents.list`,
`parents.getById`, `staff.list` et `staff.getById` chargent
`user: { select: { email, name, emailVerified } }` et exposent les trois champs
dans leur schéma de sortie. **Aucun écran ne lit `user.name` ni
`user.emailVerified` sur ces quatre procédures** : les tables et les fiches
affichent l'email, et les seuls consommateurs réels de ces deux champs passent
par `users.getById` (l'îlot de TD-017) et par la fiche personnel en PDF.

Ce n'est pas du code mort au sens strict — les colonnes sont bien lues en base
et bien sérialisées — mais c'est du travail et de la donnée transportés pour
personne, sur les deux procédures les plus appelées de l'application (la liste
des parents alimente aussi les sélecteurs de facture et d'inscription).

**Non retiré par cette passe** : enlever un champ d'un `.output()` tRPC change
le contrat exposé au client. Le gain est de quelques octets par ligne ; le
risque est un écran qui lisait le champ par un `...spread` non repéré. À faire
avec la relecture des composants concernés, pas par une passe automatique.

**Résolution cible** : réduire le `select` **et** le schéma de sortie à `email`
sur les quatre procédures, ou décider que `user` y est un objet de commodité
stable et l'assumer.

## TD-022 — Douze implémentations locales du même formatage de date — P3 — OPEN

**Constat (2026-08-15, cinquième passe de code mort)** : `lib/utils.ts` exporte
`formatDate()` (locale `fr-FR`, `JJ/MM/AAAA`) et **quatre fichiers** l'utilisent
— tous côté espace parent. Ailleurs, **douze** définitions locales refont le
même travail sous cinq noms différents (`formatDate`, `formatDateFR`,
`formatDateFr`, `formatDateISO`, plus `formatCurrency` en trois exemplaires et
`formatAmount`), réparties entre `components/` et les cinq documents de
`lib/pdf/`.

Aucune n'est morte : chacune a son appelant dans son fichier. Le défaut est la
divergence latente — un correctif de format (fuseau, année sur deux chiffres,
tiret insécable) ne se propagerait pas, et rien ne signale au lecteur qu'un
helper partagé existe déjà.

**Résolution cible** : rassembler le formatage de date et de montant dans
`lib/utils.ts` (ou un `lib/format.ts` dédié), en gardant une variante explicite
pour les PDF si leur rendu doit rester distinct — auquel cas la variante vit à
côté de `PDFFooter`, avec le commentaire qui dit pourquoi elle diffère.
