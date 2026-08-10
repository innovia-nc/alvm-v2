# BACKLOG produit — ALVM Vercel (issu de la revue CDC)

> Mono-tenant, parent-scoped. Conventions ALVM : pas de NestJS/RLS/triggers SQL,
> compta dans `server/services/accounting.service.ts`, **TGC = 0 volontaire et legal**
> (exoneration ALVM art. LP 492 — ne JAMAIS "corriger").
>
> Date de revue : 2026-06-08. Triage technique grounded fourni par le Scrum Master.

## Index priorise

| ID | Titre | SP | MoSCoW | Valeur/Effort | DoR | Dependances |
|----|-------|----|--------|---------------|-----|-------------|
| BUG-001 | Recherche texte inscriptions (fix front) | 2 | Must | Quick win | ✅ **DONE (2026-06-08)** | aucune |
| FEAT-001 | Modes de reglement sur facture PDF | 2 | Should | Quick win | ✅ **DONE (2026-06-08)** | aucune |
| FEAT-002 | Libelles "Parent/Client" & "Enfant/Stagiaire" | 2 | Should | Quick win | ✅ **DONE (2026-06-08)** | aucune |
| FEAT-003 | Historique des inscriptions par enfant | 5 | Must | Feature majeure | ✅ **DONE (2026-06-08)** | (pref. apres FEAT-002) |
| FEAT-004 | Tracabilite factures (cree par / valide par) | 3 | Should | Feature majeure | ✅ **DONE (2026-06-08)** | sequencer migration avec FEAT-005 |
| FEAT-005 | Auto-deduction avoirs sur prochaine facture | 5 | Must | Feature majeure | ✅ **DONE (2026-08-09)** | reactivee par US-FACT-02 |
| EPIC-006 | Tableau permissions par role | XL | — | — | ❌ **ABANDONNE (2026-06-08)** | decision client : drop |

> **FEAT-005 reactivee le 2026-08-09** par le backlog MIKADO (US-FACT-02), qui
> tranche les arbitrages metier restes ouverts en juin. Livree — voir la section
> « Backlog MIKADO » ci-dessous. **EPIC-006 reste abandonnee** (decision du
> 2026-06-08).

---

## Backlog MIKADO — livre le 2026-08-09

Source : `Spécification des évolutions et correctifs – MIKADO`. 7 US, ~15,5 SP
estimes. Toutes livrees sur `claude/branches-project-review-5dql6v`.

| ID | Titre | Est. | Etat | Notes de livraison |
|----|-------|------|------|--------------------|
| US-UX-01 | Recherche declenchee sur validation (Entree) | 3 SP | ✅ DONE | Point unique : `components/ui/data-table-server.tsx`, partage par ~19 tables. **+6 barres de recherche inertes reactivees** (voir ci-dessous). |
| US-UX-02 | Contraste texte enfant en mode sombre | 0,5 SP | ✅ DONE | Tokens `bg-popover` / `text-muted-foreground` au lieu de couleurs codees en dur. |
| US-UX-03 | Repositionnement du bloc signature (fiche enfant) | 1 SP | ✅ DONE | Cause racine : footer PDF en `position: absolute`. Autorisations remises dans le flux. |
| US-PERS-01 | Generation automatique de mot de passe | 2 SP | ✅ DONE | Generation navigateur (Web Crypto), politique partagee client/serveur, modale bloquante. |
| US-PERS-02 | Nettoyage fiche personnel + reactivation recherche | 2 SP | ✅ DONE | Libelles retires ; recherche = correctif purement front (le router acceptait deja `search`). |
| US-FACT-01 | Detail des modes de reglement sur le PDF facture | 2 SP | ✅ DONE | Le bloc existait (FEAT-001) : ajout de « Non reglee » / « Partiellement reglee » + numero d'avoir. |
| US-FACT-02 | Deduction automatique des avoirs sur facture suivante | 5 SP | ✅ DONE | = FEAT-005. Voir arbitrages ci-dessous. |

### Ecarts constates par rapport a la specification

- **US-UX-01 — perimetre elargi.** Le DoR supposait « 5 modules a verifier,
  potentiellement dupliques ». En pratique un seul composant partage porte la
  recherche : le correctif est central. En revanche l'audit a revele que **6
  tables affichaient une barre de recherche totalement inerte** (Personnel admin
  et staff, Factures, Avoirs, Remboursements, Paiements cote staff) — defaut non
  decrit dans la spec, corrige au passage.
- **US-PERS-02 — effort revu a la baisse.** Le DoR prevoyait un diagnostic
  backend. Les routers acceptaient deja `search` : seul le branchement front
  manquait. Traite avec US-UX-01.
- **US-FACT-01 — deja partiellement livre.** FEAT-001 (2026-06-08) couvrait
  deja le detail des reglements ; restaient le cas « non reglee » et la dette
  TD-A2 (couverture de test du rendu), tous deux soldes.
- **US-PERS-01 — UI refaite.** Une implementation anterieure (FEAT-007, PR #14
  jamais fusionnee) generait le mot de passe cote serveur et l'affichait *apres*
  creation. Le DoR MIKADO demande un bouton remplissant le champ *avant*
  soumission : l'UI a ete reprise, la partie serveur conservee en filet.

### US-FACT-02 — arbitrages tranches

Les 5 questions restees ouvertes en juin (section « Questions client » ci-dessous)
sont tranchees ainsi :

- **(a) Moment de la deduction** → a l'**emission** (DRAFT → SENT). Un brouillon
  reste modifiable ; imputer dessus obligerait a de-imputer a chaque edition.
- **(b) Application partielle** → oui, reliquat conserve (exige par le Gherkin).
- **(c) Ordre** → FIFO, du plus ancien au plus recent. Credits expires ignores,
  avoirs annules exclus.
- **(d) Notification parent** → non (hors perimetre MIKADO).
- **(e) Coherence comptable** → **point resolu sans schema nouveau.** Une
  imputation est materialisee par un `Payment` porte par la methode de reglement
  `CREDIT_NOTE`, deja en production pour le reglement manuel par avoir.
  `createPaymentEntries` en derive l'ecriture BQ D 4191 / C 411000, contrepartie
  exacte du C 4191 pose a l'emission de l'avoir. Aucun compte nouveau, aucune
  ecriture inventee, FEC coherent par construction.

Implementation : `server/services/credit-application.service.ts`, appele depuis
`invoices.validate`. Tests : `test/unit/credit-application.spec.ts` (16 cas,
dont l'equilibre de la partie double) + 4 cas d'integration router.

**Dette ouverte associee** : TD-003 (suppression d'un paiement par avoir — le
solde du credit n'est pas restaure). Anterieure a US-FACT-02, rendue plus
frequente par elle. Voir `docs/dette-technique.md`.

---

## Retours de recette — livre le 2026-08-10

Source : `Backlog MIKADO 2` (retours de tests, compte `admin@alvm.nc`). 4 US,
~5 SP estimes. Toutes livrees.

| ID | Titre | Est. | Etat | Notes de livraison |
|----|-------|------|------|--------------------|
| US-FACT-01-bis | Chevauchement des modes de reglement au-dela de 4 | 1 SP | ✅ DONE | Meme cause racine que US-UX-03 : footer PDF en `position: absolute` sans reserve de place. `paddingBottom: 90` + lignes insecables. |
| US-FACT-02-bis | Liste des factures vide a la creation d'un avoir | 2 SP | ✅ DONE | Le formulaire demandait `limit: 500` alors que le routeur plafonne a 100 : la requete etait rejetee par Zod et l'erreur n'etait pas affichee. |
| US-FAM-01 | Suppression bloquee a tort pour un parent sans enfant | 1 SP | ✅ DONE | Lien orphelin vers un enfant **archive** : le lien survivait au soft-delete et declenchait le trigger legacy. |
| US-FAM-02 | Message d'erreur technique brut a la suppression | 1 SP | ✅ DONE | Verification metier en amont + interception de l'erreur BDD en filet de securite. |

### Causes racines (diagnostic)

- **US-FACT-01-bis.** Le `PDFFooter` partage est en `position: absolute`
  (`bottom: 16`) et occupe ~70pt une fois les coordonnees et la mention legale
  rendues. La page facture ne reservait que ses 40pt de padding : le contenu
  qui coule en bas de page passait **sous** le pied de page. Mesure sur rendu
  reel (2 lignes de facture) : a 4 reglements le bas du tableau tombait a
  y=67,5 et a 5 reglements a y=43,5, soit **dans** la bande du pied de page
  (dont la ligne haute est a y=61,7). Correctif identique a celui de US-UX-03
  sur la fiche enfant : `paddingBottom: 90`, plus `wrap={false}` sur les lignes
  de reglement et sur le bloc des totaux, et `minPresenceAhead` sur le titre
  de section pour qu'il ne reste pas seul en bas de page. Contrepartie assumee :
  une facture chargee bascule sur une 2e page un peu plus tot qu'avant — le
  scenario Gherkin autorise explicitement le saut de page.

- **US-FACT-02-bis.** `credit-note-form.tsx` appelait
  `invoices.list({ limit: 500 })` alors que l'input du routeur est plafonne a
  `max(100)`. Zod rejetait la requete, `data` restait `undefined` et le
  `Select` se rendait vide — **sans aucun message**, l'erreur de la query
  n'etant pas lue. Correctif : `limit: 100`, filtre explicite sur les statuts
  eligibles, et affichage de l'erreur comme de l'etat vide.

- **US-FAM-01 / US-FAM-02.** L'invariant « un enfant a toujours au moins un
  parent » est porte par un **trigger legacy** de la BDD (absent du depot, donc
  invisible des tests unitaires mockes). `parents.delete` supprimait *tous* les
  liens du parent (`childParent.deleteMany`) apres avoir archive les enfants
  dont il etait le seul parent — le trigger, lui, ne se soucie pas du
  soft-delete et refusait la suppression du dernier lien. Consequence :
  l'erreur brute de Prisma remontait telle quelle jusqu'a l'utilisateur, y
  compris pour un parent **sans aucun enfant visible** — cas ou un enfant
  archive conservait son lien (le soft-delete masque l'enfant dans
  `children.list`, mais la ligne `children_parents` subsiste).

### Arbitrages retenus (points laisses ouverts par les DoR)

- **US-FACT-01-bis — comportement au-dela de 4 lignes.** Saut de page
  automatique (option explicitement ouverte par le Gherkin), et non
  redimensionnement : reduire la police du tableau des reglements degraderait
  la lisibilite d'un document comptable.
- **US-FACT-02-bis — statuts eligibles a un avoir.** Retenu : **SENT, PAID,
  OVERDUE**. `DRAFT` est un devis (aucune ecriture comptable emise, le PDF
  porte d'ailleurs le titre « DEVIS ») et `CANCELLED` / `CREDITED` n'ont plus
  rien a crediter. **A confirmer avec le metier** : le filtre est pose sur le
  selecteur ; `creditNotes.create` reste volontairement permissif pour ne pas
  invalider des avoirs existants tant que l'arbitrage n'est pas confirme.
- **US-FAM-01 / US-FAM-02 — sort des enfants du dernier parent.** Le
  comportement precedent (archiver silencieusement l'enfant) est remplace par
  un **blocage explicite**, conformement aux deux scenarios Gherkin. Un lien
  vers un enfant **deja archive** ne bloque plus mais est **conserve** :
  le supprimer violerait l'invariant.

### Ecart constate

- **Perimetre du chevauchement PDF.** Trois autres documents partagent le meme
  `PDFFooter` sans reserver de place en bas de page : `credit-note-pdf`,
  `staff-profile-pdf`, `attendance-list-pdf`. Ils portaient donc le meme defaut
  latent. → **Traite le 2026-08-10** (TD-004) : les 5 documents declarent
  desormais la reserve partagee `PDF_FOOTER_RESERVED_SPACE`, verrouillee par un
  test sur PDF reellement rendu.

---

## Priorisation — synthese

**Quick wins (faire en premier, Valeur >= effort, tous READY) :**
BUG-001 (2) + FEAT-001 (2) + FEAT-002 (2) = 6 SP. Aucun risque, aucune migration, valeur immediate.

**Features majeures READY :**
FEAT-003 (5, essentiel client) et FEAT-004 (3, audit interne, migration legere).

**A clarifier avant dev (NON-READY) :**
- FEAT-005 : arbitrages metier + dette comptable a cadrer.
- EPIC-006 : construction from scratch, decisions client structurantes manquantes.

## Sequence de lots proposee

### Lot A — Quick wins (sprint courant)
- BUG-001 (2) — debloque une fonction cassee
- FEAT-001 (2)
- FEAT-002 (2)
- **+ option** FEAT-004 (3) si capacite (migration Invoice isolee, avant FEAT-005)
**Total : 6 a 9 SP.** Tout est READY, livrable et demontrable immediatement.

### Lot B — Features majeures
- FEAT-003 (5) — historique inscriptions (essentiel client), apres FEAT-002 pour figer les titres
- FEAT-004 (3) si non pris en Lot A
**Total : 5 a 8 SP.**

### Lot C — Chantier comptable (apres deblocage client)
- FEAT-005 (5) — uniquement APRES validation des arbitrages (a, b, c) et du cadrage comptable (e).
- Sequencer apres FEAT-004 : les deux touchent `Invoice` / migrations — eviter migrations concurrentes.

### Lot D — Chantier securite (cycle ulterieur, dedie)
- EPIC-006 — demarrer par le **Spike (Story 1)** une fois les 7 questions client tranchees, puis decliner en sous-stories. Ne PAS melanger aux lots fonctionnels.

## Dependances (recap)
- FEAT-003 : preferablement apres FEAT-002 (eviter de re-toucher le titre de section "Inscriptions").
- FEAT-004 & FEAT-005 : touchent toutes deux `Invoice` (migration + flux facturation) -> **ordonner FEAT-004 puis FEAT-005**, ne pas paralleliser sur la meme working tree (cf. CLAUDE.md global §5.3 — worktree dedie si agents Backend en parallele).
- EPIC-006 : transverse, impacte tous les routers sensibles -> chantier isole.

## Questions client (CADUQUES — FEAT-005 & EPIC-006 abandonnees le 2026-06-08)

> Conservees pour memoire uniquement. Les deux stories ont ete droppees ; ces questions ne sont plus a poser sauf reactivation explicite du besoin.


### FEAT-005 — Auto-deduction des avoirs (arbitrages metier + compta)
- (a) Deduction a la **creation DRAFT** ou a l'**emission SENT** ? — *hypothese : SENT.*
- (b) **Application partielle** si credit > facture ? — *hypothese : oui, reliquat conserve.*
- (c) **Ordre** si plusieurs credits ? — *hypothese : FIFO (plus ancien d'abord), credits expires ignores.*
- (d) **Notifier le parent** ? — *hypothese : non au MVP.*
- (e) **Coherence comptable** : generer les ecritures de l'application du credit dans `accounting.service.ts` ? — **A CADRER avec le referent comptable** (point le plus bloquant ; le chemin `applyCredit` actuel ne genere aucune ecriture).

### EPIC-006 — Permissions par role (decisions structurantes)
1. Roles exacts (garder STAFF/ADMIN ou introduire SECRETARY/DIRECTOR ?) + definition de chacun.
2. Granularite permissionnable : par module ? par action CRUD ? module x action ?
3. Permissions **statiques par role** ou **dynamiques cochables par utilisateur** ?
4. Roles **custom** crees par l'admin, ou liste figee ?
5. Migration des comptes `STAFF`/`ADMIN` existants vers quels roles ?
6. Cumul de roles / hierarchie (DIRECTOR > SECRETARY) ?
7. Le role PARENT reste-t-il hors de ce systeme ? *(hypothese : oui).*

## Dette technique tracee (issue du Lot A — QA 2026-06-08)
- **TD-A1** — ~~test auto BUG-001 (stabilite hook `useServerPagination`, verrou R-B)~~ → ✅ **RESOLU** : `test/unit/use-server-pagination.spec.ts` (24 tests) ajoute avant livraison.
- **TD-A2** (P3) — FEAT-001 : couverture de test limitee a la shape de la requete `generatePDF`. Ajouter un test du mapping output (facture AVEC paiements) + rendu du bloc PDF (cas non-vide / vide). Assigne : backend/qa, sprint suivant.
- **TD-A3** (P2, **preexistant hors Lot A**) — config ESLint 9 absente (`eslint.config.js` flat config manquante) : `eslint .` casse, gate lint `exhaustive-deps` non executable en CI. Assigne : devops/frontend. A corriger pour reactiver le lint hooks React.

## Dette technique tracee (issue du Lot B — QA 2026-06-08)
- **TD-LOTB-1** — ~~condition morte d'affichage du bloc Tracabilite (`invoice-details.tsx`)~~ → ✅ **RESOLU** (corrige avant livraison).
- **TD-LOTB-2** (P3) — renforcer le test d'isolation FEAT-003 : assertion combinant `childId` + contexte parent (le scope `where.parentId` AND-e est deja garanti ; renfort explicite du Scenario 4). Assigne : qa, sprint suivant.

### ⚠️ Action de deploiement FEAT-004 (migration BDD)
La migration `prisma/migrations-manual/FEAT-004-tracabilite-invoice.sql` ajoute 2 colonnes optionnelles sur `invoices`. À appliquer sur Supabase via **`prisma migrate deploy`** ou **`prisma db push`** — **JAMAIS `prisma migrate dev`**. Snapshot Supabase recommande avant application en prod. Champs optionnels = retro-compat (aucun backfill).

## Hors perimetre / backlog futur (rappels)
- **Abandonnes** : refonte Avoir/Remboursement, MDP staff par defaut, interface unifiee admin/staff, **FEAT-005 (auto-deduction avoirs)**, **EPIC-006 (permissions par role)**.
- **Reporte (backlog futur, pas de story)** : ajout du **lieu de naissance** sur la fiche enfant.
- Notification parent lors de l'application d'un avoir (rattachable a FEAT-005 plus tard).
