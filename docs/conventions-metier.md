# Conventions métier et techniques

> Extraites de `CLAUDE.md` (qui n'est plus qu'un index, CLAUDE.md InnovIA §5.14).
> Chemins : `alvm-back/src/…` (back), `alvm-front/…` (front).

## Écritures comptables

Les écritures VE (ventes) et BQ (banque) sont générées par
`alvm-back/src/services/accounting.service.ts` (plus de triggers comptables) :
`createInvoiceAccountingEntries()`, `createCreditNoteAccountingEntries()`,
`createPaymentEntries()` / `createRefundEntries()`. Numéros d'écriture : compteur
`ACCOUNTING_ENTRY` du tenant (`document_counters`).

## Imputation automatique des avoirs (US-FACT-02)
`alvm-back/src/services/credit-application.service.ts` impute les credits disponibles
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


## Comptabilite
- Ne JAMAIS hardcoder le taux TGC — utiliser les valeurs stockees sur la facture
- **Taux de TGC par association** (`app_settings.pricing.tax_rate`, par tenant).
  Une association est créée avec `tax_rate = 0` (`alvm-back/src/services/tenant-defaults.ts`) :
  les associations visées sont exonérées au titre de l'article LP 492 — Loi du pays
  N°2016-14 du 30 septembre 2016 (c'est le cas d'**ALVM**, dont toutes les factures
  sont à TGC = 0 par design). Seul l'admin de l'association modifie ce taux ; ne
  JAMAIS « corriger » une valeur 0 à 11, ni coder un taux en dur (le repli des
  helpers est 0).
- Le compte auxiliaire client : `'AUX' + uuid.replace(/-/g, '').slice(0, 8)`
- `deriveClientAux()` n'existe plus qu'en TypeScript (plus de version SQL)
- Les ecritures VE sont creees quand `status` passe a `SENT` (appel explicite dans le router)
- Les ecritures BQ sont creees lors de la creation d'un paiement/remboursement

## Nom du fichier FEC (TD-012)
L'article A47 A-1 du LPF impose `SIRENFECAAAAMMJJ.txt` (AAAAMMJJ = date de
cloture de l'exercice, ici la date de fin de la periode exportee). Le SIREN vit
dans `app_settings.accounting.fec_siren` et se lit via `getFecSiren()` ; le
champ de l'ecran d'export ne fait que le surcharger ponctuellement. Il ne figure
PAS dans le contenu du fichier — les 18 colonnes du FEC n'ont pas ce champ.
Sans SIREN, l'export reste possible sous le nom historique et l'ecran previent
de la non-conformite : ne jamais bloquer un export comptable pour un nommage.

## Afficher un statut : toujours `<StatusBadge />` (TD-013)
`alvm-front/components/shared/status-badge.tsx` porte le libelle francais, la couleur
calibree WCAG AA (utilities `status-badge-*` de `alvm-front/app/globals.css`) et l'icone
de chaque statut metier. Ne jamais reecrire un `getStatusBadge()` local ni
afficher l'enum brut : c'est exactement ce qui a fait lire `IMMEDIATE_REFUND`
aux utilisateurs et contourner les couleurs calibrees sur les badges d'ACM.
Un nouveau statut s'ajoute dans la table du fichier partage, avec son test dans
`alvm-back/test/unit/status-badge.spec.ts`.

## Soft-delete
- Extension Prisma `soft-delete.ts` ajoute `deletedAt: null` automatiquement
- Pour les enregistrements supprimes : `{ deletedAt: { not: null } }`
- L'extension ne filtre que le `where` **de premier niveau** des lectures
  (`findFirst`/`findMany`/`count`/`aggregate`/`groupBy`). Une relation lue en
  `include`/`select` imbrique n'est PAS filtree : `children_parents` conserve
  donc ses lignes vers des enfants archives, invisibles cote UI.

## PDF — reserver la place du pied de page
`PDFFooter` (`alvm-back/src/pdf/shared/pdf-footer.tsx`) est en `position: absolute` : il
sort du flux. **Tout document qui le rend doit poser
`paddingBottom: PDF_FOOTER_RESERVED_SPACE` sur le style de sa `Page`**, sinon le
contenu qui coule en bas de page s'ecrit DESSOUS (deja remonte deux fois en
recette : US-UX-03 puis US-FACT-01-bis). Ajouter aussi le nouveau document a
`alvm-back/test/unit/pdf-footer-overlap.spec.tsx` — le defaut n'apparait qu'au calcul de
mise en page, un test d'arbre React ne le voit pas.

## PDF d'avoir — montants en valeur absolue
Un avoir stocke ses montants **negatifs** en base, mais `CreditNotePDF` pose
lui-meme le signe « - » devant chaque valeur. `creditNotes.generatePDF` transmet
donc des `Math.abs(...)` — sinon le document affiche `--12 000 XPF`. Ne pas
"corriger" ces `Math.abs` sans regarder le composant.

## Supprimer un fichier : la ligne ET le blob (TD-006)
Toute suppression d'un enregistrement qui porte une URL de fichier
(`ChildDocument.fileUrl`, `StaffDocument.fileUrl`, `organization.logo_url`) doit
appeler `deleteFromStorageBestEffort(url, contexte)` **apres** l'ecriture en
base. Deux regles :
- la base d'abord — sinon un echec de suppression en base laisse une ligne qui
  pointe vers un objet disparu ;
- best effort — un store injoignable est trace, jamais propage : un document que
  l'utilisateur a supprime ne doit pas ressusciter parce que Vercel Blob a
  hoquete.

## Televerser un fichier : route HTTP, nom unique, blob annulable (TD-025)
Un `File` ne traverse pas tRPC/superjson : les televersements passent par des
routes `/api/upload/*` (`alvm-back/src/http/uploads.handler.ts`), qui portent AUSSI la creation de la ligne en base
(il n'y a pas de `childDocuments.create`). Trois regles :
- **valider MIME et taille cote serveur** — la validation des composants
  (`alvm-front/components/ui/image-upload.tsx`, `document-upload.tsx`) n'est qu'un confort, elle se
  contourne ;
- **objet rangé sous le préfixe de l'association** (`organizations/<uuid>/…`,
  `tenantBlobPath`) ; `settings.setLogoUrl` refuse une URL hors de ce préfixe ;
- **nom de blob unique** (`logo-<uuid>.png`) pour le logo : `settings.setLogoUrl`
  supprime le blob precedent (TD-006), et a nom fixe les deux URL seraient
  identiques — il effacerait le fichier qui vient d'etre televerse ;
- **blob d'abord, ligne ensuite, et blob annule si la ligne echoue** : c'est le
  pendant amont de TD-006 (un objet public et facture sans aucune reference).

La regle d'acces a un enfant est partagee entre le routeur et la route dans
`alvm-back/src/helpers/child-access.helper.ts` — ne pas la redupliquer.

## Envoi d'email (TD-008) — file `alvm-email`
Tout envoi passe par la file BullMQ `alvm-email` (CLAUDE.md InnovIA §5.11) :
les procedures (`invoices.sendEmail`, `account.requestReset`) verifient les
preconditions puis appellent `enqueueEmail()` (`alvm-back/src/queues/email.queue.ts`)
en DERNIER dans la transaction du tenant ; le worker (`alvm-back/src/worker.ts`,
processus separe, meme image) compose et envoie via `email.service.ts` (API REST Resend).
Regles :
- la ligne `email_messages` est l'autorite (historique : `invoices.emailHistory`) ;
  le worker n'envoie jamais sans elle. Ni corps ni jeton en base ; le job ne
  porte que des identifiants (+ le lien de reinitialisation, ephemere) ;
- sans `RESEND_API_KEY` ou sans `REDIS_URL` : `PRECONDITION_FAILED` explicite,
  et `settings.isEmailConfigured` desactive les boutons. Redis injoignable :
  `SERVICE_UNAVAILABLE` (la transaction annule la ligne) ;
- `account.requestReset` repond pareil que le compte existe ou non, meme si
  la file tombe apres la recherche du compte (erreur journalisee cote serveur).
Ne jamais inventer de code d'erreur tRPC — c'est exactement ce que faisait le
`'NOT_IMPLEMENTED' as any` supprime par TD-008. Detail et verification :
`docs/file-emails.md` (ADR 0003).

## Un enfant a toujours au moins un parent
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

Base neuve : ce trigger legacy n'existe plus ; `parents.delete` applique la règle
avant toute écriture. Voir TD-005 dans `docs/dette-technique.md`.

## Optimistic locking
- Champ `version` sur Invoice — `updateMany({ where: { id, version } })`

## Transitions de statut facture
```
DRAFT → SENT | CANCELLED
SENT → PAID | OVERDUE | CANCELLED (si paidAmount == 0)
OVERDUE → PAID | CANCELLED
PAID → CREDITED
CANCELLED → (rien)
CREDITED → (rien)
```

