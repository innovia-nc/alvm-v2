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

## TD-012 — « Mon Profil » : un menu qui promettait un écran inexistant — P3 — OPEN

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
