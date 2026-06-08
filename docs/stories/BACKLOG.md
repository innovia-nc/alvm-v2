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
| FEAT-005 | Auto-deduction avoirs sur prochaine facture | 5 | Could* | Feature majeure (compta) | **NON-READY** | arbitrages metier + cadrage compta ; sequencer avec FEAT-004 |
| EPIC-006 | Tableau permissions par role | XL | Won't (ce cycle) | A decouper | **NON-READY** | decisions client (chantier securite dedie) |

\* FEAT-005 : **Must** sur le fond (besoin reel), mais reclasse **Could ce cycle** tant que les arbitrages comptables ne sont pas valides — ne pas la mettre en sprint avant deblocage.

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

## Questions client en attente (bloquantes pour passage Ready)

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
- **Abandonnes** : refonte Avoir/Remboursement, MDP staff par defaut, interface unifiee admin/staff.
- **Reporte (backlog futur, pas de story)** : ajout du **lieu de naissance** sur la fiche enfant.
- Notification parent lors de l'application d'un avoir (rattachable a FEAT-005 plus tard).
