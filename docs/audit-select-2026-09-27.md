# Audit « select obligatoire » — refonte SaaS multi-tenant (2026-09-27)

Règles appliquées : CLAUDE.md InnovIA §5.9 (whitelist `select`, jamais
`include: { relation: true }` ni modèle complet renvoyé), §5.12 (contrat
front ↔ back vérifié au `tsc`), §5.13 (exposition par rôle).
Branche : `feat/saas-select-audit` (base `refonte/saas-multi-tenant` @ 10c9890).

## Synthèse

| Mesure | Avant | Après |
|---|---|---|
| `include:` dans `alvm-back/src` (`grep -rn "include:"`) | 50 | 1 (`invoice-pdf.service`, interne, laissé volontairement — voir « Hors périmètre ») |
| Routeurs tRPC dont une requête renvoyée ou relue n'avait pas de `select` | 20 sur 22 (`dashboard`, `features` déjà conformes) | 0 |
| Procédures de comptes sans schéma de sortie | `account.me`, `platform.accounts/createAccount/updateAccount` | toutes bornées par un `.output()` en plus du `select` |
| Champs retirés du contrat API | — | voir « Champs retirés » |
| Projections par rôle (PARENT) | `invoices` (noms créateur/validateur) | + `camps`, `attendances.list`, `payments`, `invoices.accountingExportedAt` |

Constat principal : aucune réponse ne transportait de secret (`accounts`,
`providerAccountId`, `sessionVersion`) — les schémas Zod de sortie filtraient
déjà. Mais la protection reposait sur ce filtre seul : 50 `include` chargeaient
des lignes complètes (compte de connexion, `organizationId`, `deletedAt`,
auteurs), et 4 procédures de comptes n'avaient aucun schéma de sortie. Une
modification du mapping ou du select suffisait à faire fuiter. Désormais la
requête elle-même est une whitelist, et les procédures de comptes sont bornées
deux fois (select + schéma de sortie).

## Champs retirés du contrat (réponses)

Aucun n'était lu par un écran (vérifié au `grep` et au `tsc` du front, qui
type-checke les routeurs du back via `@alvm/back/trpc`).

| Procédure(s) | Champ retiré | Raison |
|---|---|---|
| `camps.list/getById/create/update/duplicate` | `createdBy` | identifiant interne d'un membre du personnel |
| `camps.list/getById` (PARENT) | `creator` → `null` | traçabilité interne (§5.13) ; le front (`CampDetailTab`, écrans personnel) accepte `null` |
| `attendances.list/markAttendance` | `recordedBy` | identifiant interne |
| `attendances.list` (PARENT) | `notes`, `recorder` → `null` | notes internes du personnel et auteur du pointage (§5.13) |
| `childDocuments.list` | `uploadedBy` | identifiant du déposant (souvent un membre du personnel) visible d'un parent ; type `ChildDocument` du front aligné |
| `staffDocuments.list/getById` | `uploadedBy` | identifiant interne |
| `settings.getByCategory` | `updatedBy` | identifiant interne |
| `fec.history` | `createdBy` | identifiant interne |
| `organizations.current` | `id` | identifiant du tenant (implicite côté métier) |
| `platform.audit` | `organizationId`, `actorId`, `target` | remplacés par leurs libellés (`actorName`, `targetLabel`), seuls affichés |
| `invoices.list/getById` (PARENT) | `accountingExportedAt` → `null` | suivi comptable interne |
| `payments.list/getById` (PARENT) | `notes` → `null` | notes internes du personnel (§5.13) |

## Tableau par procédure

« Avant » décrit ce que la requête chargeait (le schéma de sortie filtrait
ensuite, sauf mention « sans schéma ») ; « Après » ce qui est lu et renvoyé.

### Comptes et plateforme

| Procédure | Avant | Après |
|---|---|---|
| `users.list/getById/create/update` | `include` profils → ligne `users` complète (`sessionVersion`, `disabledAt`, `organizationId`) | `userSelect` : id, email, name, image, role, emailVerified, dates + profils parent/staff en select |
| `users.update/delete/resetPassword` (lectures internes) | lignes `users`/`accounts` complètes, `include: { parent: true, staffMember: true }` | select minimal (rôle, état, `deletedAt` des profils, `id` du credential) |
| `account.me` | select nom/email, **sans schéma de sortie** | idem + `.output({ name, email })` |
| `account.update/reset` (internes) | lignes `accounts`/`users`/`verification_tokens` complètes | select minimal (le hash n'est lu que pour `compare`) |
| `platform.accounts/createAccount/updateAccount` | `accountSelect`, **sans schéma de sortie** ; lectures internes complètes | idem + `.output(accountOutput)` ; lectures internes minimales |
| `platform.audit` | ligne d'audit complète renvoyée (`...event`) | select id, action, actorId, target, outcome, createdAt ; réponse : libellés seulement |
| `platform.integrations/saveIntegration` | ligne complète (secret chiffré) | select explicite (le secret n'est lu que pour savoir s'il existe) |
| `organizations.current` | id, slug, name, kind | slug, name, kind |
| `deactivateAccount` (service) | ligne `users` complète | role, disabledAt |

### Familles

| Procédure | Avant | Après |
|---|---|---|
| `parents.list/getById` | `include` user/liens → ligne `parents` complète | `parentSelect` + identité du compte (email, name, emailVerified) + `childrenLinks.id` |
| `parents.update/create/updateByStaff` | ligne `parents` complète (update/create) | `select: parentSelect` ; lectures internes minimales |
| `staff.list/getById/create/update` | `include` user → ligne `staff_members` complète | `staffSelect` + identité du compte |
| `staffDocuments.*` | ligne complète, spread `...d` (URL de stockage écrasée ensuite) | `staffDocumentSelect` sans `fileUrl` ni `uploadedBy` ; `delete` ne lit que staffId et l'URL à purger |
| `children.list/getById/create/createByParent/update` | `include: parentInclude` (enfant complet, liens complets) | `childSelect` : fiche + liens (id, parentId, isPrimary, relationship, coordonnées du parent) |
| `children.getParents/addParent/removeParent/setPrimaryParent/createAdult/delete` | lectures complètes | select minimal |
| `childDocuments.list/delete` | ligne complète | `childDocumentSelect` sans `fileUrl` ni `uploadedBy` |

### Camps, présences, inscriptions

| Procédure | Avant | Après |
|---|---|---|
| `camps.list/getById` | `include` campType/creator/_count, même requête pour tous les rôles | `campPublicSelect` (PARENT) / `campStaffSelect` (+ créateur) |
| `camps.create/update/duplicate` | ligne complète | `campSelect` ; lectures internes minimales |
| `campTypes.*` | ligne complète (schéma de sortie seul) | `campTypeSelect` |
| `attendances.getGridForCamp/list/markAttendance/getStatistics` | `include` imbriqués, lignes complètes | selects dédiés ; `list` : `attendanceParentSelect` / `attendanceStaffListSelect` |
| `registrations.list/getById` | `include: registrationInclude` → ligne complète (`cancelledBy`, `cancellationReason`, `selectedDays`) | `registrationDetailsSelect` |
| `registrations.create/createByStaff/updateByStaff/updateStatus` | ligne complète | `registrationScalarSelect` |
| `registrations.requestCancellation` | `include: { camp: true }`, sans schéma de sortie | select camp.startDate + `.output({ cancelled })` |
| `registrations.getAvailableCredits` | `include` → ligne `parent_credits` complète | select explicite |
| `registration-cancellation.service` | `include: { camp: { include: { campType: true } } }`, lignes/remboursements complets | selects dédiés ; aucun calcul modifié |

### Facturation et comptabilité

| Procédure | Avant | Après |
|---|---|---|
| `invoices.list` | `include` parent → ligne complète (`notes`, `pdfUrl` de stockage, auteurs) | `invoiceSummarySelect` + parent |
| `invoices.getById` | `invoiceInclude` identique pour tous les rôles | `invoiceDetailsSelect` (PARENT) / `invoiceStaffDetailsSelect` (+ créateur, validateur : id, name) |
| `invoices.create/createFromRegistration/update/validate/updateStatus` | ligne complète (y compris retours d'`issueInvoice`/`cancelUnpaidInvoice`) | `invoiceSummarySelect` |
| `invoices.fetchUnpaidRegistrations` | `include` → inscription complète | select explicite |
| `payments.list/getById` | `paymentInclude` → ligne complète (`recordedBy`, `paymentNumber`) | `paymentDetailsSelect` / `paymentParentDetailsSelect` (sans notes) |
| `payments.create/delete/statistics` | lignes complètes | selects minimaux |
| `creditNotes.*` | `include` → ligne complète | `creditNoteSelect` / `creditNoteDetailsSelect` (le motif imprimé reste visible) |
| `refunds.*` | `include` imbriqué → remboursement et règlement complets | `refundSelect` / `refundDetailsSelect` |
| `accounting.service` (VE) | `include: registration → camp → campType: true` | totalPrice + accountingCode seulement |
| `credit-application.service` (FIFO) | `parent_credits` complet | id, creditNoteId, amountRemaining + avoir (numéro, statut) |
| `settings.getByCategory` | ligne complète | `settingSelect` sans `updatedBy` |
| `paymentMethods.*` | ligne complète | `paymentMethodSelect` |
| `fec.history/getEntries` | `createdBy` ; écriture complète | sans `createdBy` ; colonnes d'`accountingEntrySchema` |

Déjà conformes, non modifiés : `dashboard.summary`, `features.*`,
`organizations.list/get/rename/setStatus/publicInfo`, `platform.branding/configuration`,
`fec.downloadExport`, handlers HTTP (`documents`, `generated-pdf`, `uploads`,
`tenant-request`).

## Hors périmètre, laissé volontairement

| Élément | Pourquoi |
|---|---|
| `invoice-pdf.service` (`include` parent/lignes/règlements) | lecture interne pour générer le PDF, rien n'est renvoyé au client (`generatePDF` ne renvoie que l'URL du proxy) ; partagé avec `invoices.sendEmail`, chantier en cours d'un autre agent |
| `fec.generateFEC` (écritures complètes) | le contenu du FEC *est* le produit ; `generateFECContent` est typé `any`, une whitelist mal tenue viderait des colonnes sans erreur de compilation |
| `reverseAccountingEntries` / `restoreCreditOnPaymentDeletion` | copies et restitutions comptables internes, jamais renvoyées |
| `internal-auth` (`verifyCredentials`) renvoie `sessionVersion` et `organizationId` | canal serveur à serveur protégé par `x-internal-secret` ; ces deux champs alimentent le JWT NextAuth et la révocation — ils ne sortent pas vers le navigateur |
| `children.*` (PARENT) : coordonnées des autres parents rattachés | décision produit existante (co-parents d'un même enfant), pas un champ interne |
| `user.name` / `user.emailVerified` transportés sans lecteur | dette déjà ouverte (TD-021) |

## Garde-fous de non-régression

`alvm-back/test/unit/select-whitelist.spec.ts` (38 tests). Chaque cas simule une
base qui renverrait une ligne complète (hash du mot de passe, `sessionVersion`,
`organizationId`, auteurs…) et vérifie :

1. que la requête Prisma porte un `select` (jamais d'`include`, y compris
   imbriqué) qui ne demande aucun champ interdit ;
2. que la réponse ne contient aucun champ interdit.

Couverture : `users.*`, `parents.*`, `staff.*`, `staffDocuments.list`,
`account.me/update`, `platform.accounts/audit`, `organizations.current`,
`children.list/getById`, `childDocuments.list`, `camps.list/getById`,
`attendances.list`, `registrations.list/requestCancellation`,
`invoices.list/getById`, `payments.list`, `creditNotes.getById`,
`refunds.list`, `settings.getByCategory`, `paymentMethods.list`,
`campTypes.listAll`, `fec.history/getEntries`. Vérifié pour `users.*` : les
tests échouent sur le code d'avant l'audit (5/5) et passent après.

Règle pour la suite : toute nouvelle requête renvoyée au client déclare un
`select` nommé (`xxxSelect`) à côté du schéma de sortie ; une vue PARENT et
une vue personnel qui divergent ont deux selects distincts.

## Vérification sur base réelle (RLS active)

Les tests unitaires simulent Prisma : ils ne prouvent pas qu'un `select` est
accepté par le moteur ni qu'il passe la RLS. Deux campagnes jetables (scripts
non versionnés, rôle `alvm_app` NOSUPERUSER NOBYPASSRLS) ont donc été jouées :

- **Lecture seule sur `alvm_dev`** (42 appels, rôles ADMIN, STAFF, PARENT,
  SUPER_ADMIN) : tous répondent, aucune réponse ne contient de champ interdit,
  un parent reçoit `creator: null` sur les camps. La base de dev ne contient
  aucune facture : la facturation est couverte par la seconde campagne.
- **Mutations sur une base neuve** (`db-migrate` + `seed`, supprimée ensuite) :
  référentiels, camps, comptes (users, staff, parents, account, platform),
  enfants, présences, facture émise depuis une inscription, règlement,
  remboursement, annulation d'inscription avec avoir futur, avoir manuel
  imputé en FIFO à l'émission, suppression d'un règlement par avoir
  (restitution du crédit), génération du FEC. Balance du FEC : 0,00 XPF
  (22 écritures) — les invariants comptables tiennent.
