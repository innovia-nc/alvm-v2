# PLAN D'EXÉCUTION — LOT A : 3 quick-wins (BUG-001, FEAT-001, FEAT-002)

> Projet : ALVM Vercel (monolithe Next.js 15 App Router + tRPC 11 + Prisma 6 + NextAuth v5).
> Architecte : analyse en lecture seule, triage technique vérifié sur les fichiers clés.
> Date : 2026-06-08.

## Synthèse
- **Nb de tâches** : 6 (3 implémentations + 3 tests/QA, dont tests fusionnables dans les tâches dev).
- **Nb de vagues** : 2 (1 vague de dev parallèle + 1 queue de finalisation série).
- **Tâches en finalisation série** : 4 (merge worktrees, `tsc`, `lint`, build, vérif manuelle exhaustivité FEAT-002).
- **Worktrees requis** : **OUI** — 3 worktrees dédiés (3 écritures concurrentes dans la même vague, règle TD-063 stricte).
- **Risques majeurs** : (1) exhaustivité FEAT-002, (2) régression BUG-001 sur TOUS les tableaux server-side, (3) `select` whitelist FEAT-001.

---

## 1. Tâches atomiques

| ID | Story | Titre | Domaine → agent | Périmètre fichiers (ÉCRITURE) | Modèle |
|----|-------|-------|-----------------|-------------------------------|--------|
| **T1** | BUG-001 | Stabiliser la référence `pagination` et corriger le debounce de recherche | frontend | `hooks/use-server-pagination.ts` (mémoïser le retour) **et/ou** `components/ui/data-table-server.tsx` (deps du `useEffect` ~L367-380) | **T3** |
| **T2** | FEAT-001 | Charger `payments` + bloc "Modes de règlement" sur le PDF facture | backend (+pdf) | `server/routers/invoices.ts` (findFirst de `generatePDF` ~L695-718 + mapping ~L744-764) ; `lib/pdf/invoice-pdf.tsx` (interface `InvoiceData` + bloc JSX) | **T2** |
| **T3** | FEAT-002 | Renommer les titres de sections "Parent → Parent / Client" et "Enfant → Enfant / Stagiaire" | frontend | Fichiers de **titres** uniquement (PageHeader `title=`, `CardTitle`, sidebar). Voir liste §6. **Exclut** colonnes, badges, enums, valeurs `value="PARENT"`. | **T2** |
| **T4** | BUG-001 | Test E2E filtrage + non-régression pagination | frontend/QA | `test/` (E2E Playwright ou test composant) — fusionnable dans T1 | T2 |
| **T5** | FEAT-001 | Test de contenu PDF (bloc paiement présent/masqué, TGC inchangé) | backend/QA | `test/unit/invoices*.spec.ts` — fusionnable dans T2 | T2 |
| **T6** | FEAT-002 | Grep de contrôle avant/après + assertions texte | QA | aucune écriture de code applicatif (vérification) — fusionnable dans T3 | T1 |

> **Recommandation** : fusionner T4→T1, T5→T2, T6→T3 (chaque agent livre code + tests dans son worktree). On garde donc **3 briefs d'agent** au lancement.

---

## 2. DAG de dépendances

```
T1 (BUG-001)  ─┐
T2 (FEAT-001) ─┼──►  FINALISATION SÉRIE (tsc + lint + build + grep contrôle)
T3 (FEAT-002) ─┘
```

- **Aucune dépendance dure inter-stories.** Les 3 tâches sont indépendantes (INVEST validé, périmètres fichiers disjoints — voir carte de contention §6).
- Tests (T4/T5/T6) dépendent faiblement de leur tâche dev parente → fusionnés dans la même tâche, donc pas de nœud DAG séparé.
- Seule contrainte d'ordonnancement : tout converge vers la queue série (merge + cohérence types).

---

## 3. Vagues parallèles (tri topologique)

```
Vague 1 (3 agents en parallèle, ≤16 OK) :
  T1 (frontend, worktree A)  ∥  T2 (backend+pdf, worktree B)  ∥  T3 (frontend, worktree C)

Vague 2 (queue de finalisation série, working tree principale, SM) :
  merge A → merge B → merge C → tsc → lint → build → grep contrôle FEAT-002
```

Une seule vague de dev. Les 3 tâches partent ensemble.

---

## 4. Queue de finalisation série (working tree principale, par le SM)

| # | Action | Détail |
|---|--------|--------|
| F1 | Merge des 3 worktrees | Ordre indifférent (pas de fichier commun). Suggéré : T2 (back) → T1 (front composant) → T3 (front titres). |
| F2 | `pnpm tsc` (typecheck global) | Vérifie surtout T2 : l'extension de l'interface `InvoiceData.payments` doit matcher le mapping dans `generatePDF`. Front→back cohérent. |
| F3 | `pnpm lint` | ESLint flat config (deps de hooks React — utile pour valider T1, `exhaustive-deps`). |
| F4 | `pnpm build` (Next.js) | Build cross — détecte toute régression de rendu PDF / composant table. |
| F5 | **Grep de contrôle FEAT-002** | Avant/après sur titres ; vérifier 0 occurrence résiduelle de titre "Parent"/"Enfant" non renommé ET 0 faux positif (colonnes/badges/enums intacts). |
| F6 | Vérif manuelle des 4 scénarios BUG-001 + snapshot PDF FEAT-001 | Gate QA final avant clôture. |

> Queue volontairement courte : aucune réconciliation de contrat lourde car les contrats sont gelés (§5) et les périmètres disjoints (§6).

---

## 5. Contrats gelés (CONTRACT-FIRST)

### 5.1 BUG-001 — contrat props à NE PAS casser (sinon régression sur 20 fichiers consommateurs)
- **`UseServerPaginationReturn`** (interface `hooks/use-server-pagination.ts`, L18-60) : signature **gelée**. Tous les champs (`page`, `setPage`, `pageSize`, `setPageSize`, `offset`, `limit`, `getTotalPages`, `goToFirstPage/Last/Prev/Next`, `hasPrevPage`, `hasNextPage`, `resetToFirstPage`) conservés à l'identique. Le fix mémoïse la **stabilité de référence** (ex. `useCallback` sur les setters + `useMemo` sur l'objet retourné), **sans modifier la forme**.
- **`DataTableServerProps`** (props de `data-table-server.tsx`) : **gelées**. Pas de changement d'API publique. Le fix porte uniquement sur les deps du `useEffect` de debounce (~L380) et/ou la stabilité de `pagination.setPage`.
- **20 fichiers consommateurs** (`*-table-client.tsx`, voir §6) : **lecture seule, AUCUNE modification**. Ils héritent du fix automatiquement.

### 5.2 FEAT-001 — contrat de données PDF
- **Forme `payments` ajoutée** au `select`/`include` du findFirst de `generatePDF` (`invoices.ts` ~L697-718), STRICTEMENT en whitelist (CLAUDE.md global §5.9) :
  ```
  payments: { select: { amount: true, paymentDate: true, paymentMethod: { select: { name: true } } } }
  ```
  (filtrer les soft-deleted si la relation le supporte : `where: { deletedAt: null }`). Le pattern existe déjà dans `invoiceInclude` ~L100-109 — **le réutiliser comme référence**, mais l'appliquer au findFirst dédié de `generatePDF` qui ne l'importe PAS aujourd'hui.
- **Extension de l'interface `InvoiceData`** (`invoice-pdf.tsx` L28-50) : **ajout uniquement**, champ optionnel pour rester rétro-compatible :
  ```
  payments?: { amount: number; paymentDate: Date; paymentMethodName: string }[];
  ```
  Mapper côté router : `paymentMethod.name → paymentMethodName`, `amount` via `toNum()`.
- **Garde-fou TGC=0** : `taxRate`, `taxAmount`, `subtotalHt`, `totalAmount` **inchangés**. Le bloc est purement informatif, n'altère AUCUN calcul. Exonération art. LP 492 préservée (CLAUDE.md projet).
- **Affichage** : libellé lisible `paymentMethod.name` (R1), JAMAIS le code technique. Bloc masqué si `payments` vide (Scénario 3).

### 5.3 FEAT-002 — formulation EXACTE gelée (à ne pas réinterpréter)
- `"Parent"` → **`"Parent / Client"`** (espaces autour du slash).
- `"Parents"` → **`"Parents / Clients"`**.
- `"Enfant"` → **`"Enfant / Stagiaire"`**.
- `"Enfants"` → **`"Enfants / Stagiaires"`**.
- Singulier/pluriel **selon le contexte d'affichage existant** (ne pas changer le nombre).
- **NE JAMAIS toucher** : `value="PARENT"`, enums, headers de colonnes (`columns.tsx`), badges de rôle, identifiants, libellés de filtres/données.
- **Zone grise signalée** (non bloquante) : sidebar parent `"Mes Enfants"` (L59 de `dashboard-sidebar.tsx`) est côté rôle PARENT. La story cible staff/admin (R3). **Décision par défaut : ne PAS renommer "Mes Enfants"** (espace parent, hors scope explicite) — à confirmer SM/PO si souhaité. Renommer uniquement les entrées sidebar staff (L91, L97) et admin (L163, L169).

---

## 6. Carte de contention + worktrees

### 6.1 Analyse de collision (point CRITIQUE demandé)
**Vérification effectuée par lecture des fichiers.** Conclusion : **AUCUN fichier commun entre les 3 tâches d'écriture.**

| Tâche | Fichiers écrits | Intersection ? |
|-------|-----------------|----------------|
| T1 (BUG-001) | `hooks/use-server-pagination.ts`, `components/ui/data-table-server.tsx` | — |
| T2 (FEAT-001) | `server/routers/invoices.ts`, `lib/pdf/invoice-pdf.tsx` | — |
| T3 (FEAT-002) | fichiers de titres (PageHeader/CardTitle/sidebar) — voir liste 6.3 | — |

**Le piège anticipé (BUG-001 ∩ FEAT-002 sur le front) est levé :**
- BUG-001 ne touche QUE le composant générique `data-table-server.tsx` + le hook `use-server-pagination.ts`. Il **ne modifie AUCUN** des 20 fichiers consommateurs (`registrations-table-client.tsx`, `registration-details.tsx`, etc.).
- FEAT-002 touche des fichiers de **titres**. Les fichiers consommateurs de la table (ex. `registration-details.tsx`, `parent-details.tsx`) peuvent figurer dans FEAT-002 **mais BUG-001 ne les touche pas** → pas de collision.
- Le découplage tient **tant que le contrat props §5.1 reste gelé**. Si T1 devait changer l'API de `DataTableServer`/`useServerPagination` (hors scope), il faudrait re-séquencer. Ce n'est PAS le cas ici (fix de stabilité de référence pur).

→ **Pas de collision de fichiers.** MAIS : **3 écritures concurrentes dans la même vague** ⇒ règle TD-063 / CLAUDE.md global §5.3 s'applique **par sécurité git** (stash/checkout concurrents sur une working tree partagée = état git désynchronisé), **indépendamment** de l'absence de collision de fichiers.

### 6.2 Worktrees dédiés (règle TD-063 — hard rule, sans dérogation)
Base macOS : `/tmp/innovia/` (créer le dossier au premier usage).

| Tâche | Worktree | Branche suggérée |
|-------|----------|------------------|
| T1 (BUG-001) | `/tmp/innovia/alvm-bug001-search` | `fix/bug-001-recherche-inscriptions` |
| T2 (FEAT-001) | `/tmp/innovia/alvm-feat001-pdf-paiements` | `feat/feat-001-modes-reglement-pdf` |
| T3 (FEAT-002) | `/tmp/innovia/alvm-feat002-libelles` | `feat/feat-002-libelles-parent-enfant` |

Commande de création (à exécuter par le SM AVANT lancement des agents) :
```
git worktree add /tmp/innovia/alvm-bug001-search       -b fix/bug-001-recherche-inscriptions
git worktree add /tmp/innovia/alvm-feat001-pdf-paiements -b feat/feat-001-modes-reglement-pdf
git worktree add /tmp/innovia/alvm-feat002-libelles      -b feat/feat-002-libelles-parent-enfant
```
Nettoyage post-merge : `git worktree remove <chemin>` après chaque PR mergée.

### 6.3 Cartographie FEAT-002 (fichiers à inspecter pour les titres)
Candidats prioritaires (présence de "Parent"/"Enfant", à filtrer sur les **titres** uniquement — exclure `columns.tsx`) :
- **Sidebar** : `components/layout/dashboard-sidebar.tsx` (staff L91/L97, admin L163/L169 ; "Mes Enfants" parent L59 = zone grise §5.3).
- **Pages admin/staff** (PageHeader/CardTitle) : `app/dashboard/staff/parents/page.tsx`, `app/dashboard/staff/parents/[id]/page.tsx`, `app/dashboard/staff/children/page.tsx`, `app/dashboard/staff/children/[id]/page.tsx`, `app/dashboard/staff/children/[id]/parents/page.tsx`, `app/dashboard/admin/users/parents/page.tsx`, `app/dashboard/admin/children/page.tsx`, `app/dashboard/admin/children/[id]/page.tsx`, `app/dashboard/admin/children/[id]/parents/page.tsx`.
- **Composants à titres** : `components/admin/parents/parent-details.tsx`, `components/admin/children/child-details.tsx`, `components/staff/children/manage-parents.tsx`, `components/staff/children/child-form.tsx`, `components/admin/users/user-form.tsx`, `components/admin/registrations/registration-details.tsx`, `components/admin/parents/parent-edit-form.tsx`/`parent-create-form.tsx`.
- **NE PAS toucher** (faux positifs techniques) : tous les `*/columns.tsx`, `*-table-client.tsx` (headers de colonnes), `value="PARENT"`, enums, `breadcrumb-provider.tsx`/`breadcrumbs.tsx` (à vérifier au cas par cas : si ce sont des libellés de navigation = potentiellement in-scope, si techniques = out).

> L'agent T3 doit **grep-puis-juger** chaque occurrence : titre de section = in, donnée/colonne/badge/enum = out.

---

## 7. Niveau de modèle par tâche

| Tâche | Niveau | Modèle | Justification |
|-------|--------|--------|---------------|
| **T1 (BUG-001)** | **T3** | `sonnet` + `ultrathink`/`think hard` | Debug de hook React subtil : boucle de re-render causée par référence instable dans deps d'`useEffect`. Le fix doit stabiliser sans casser la pagination server-side ni l'API consommée par 20 fichiers. Raisonnement sur le cycle de rendu requis. |
| **T2 (FEAT-001)** | **T2** | `sonnet` | Intégration directe d'un contrat existant : ajout `select` whitelist (pattern déjà présent L100-109) + bloc JSX @react-pdf/renderer. Logique linéaire, garde-fou TGC clair. Pas d'algorithmique. |
| **T3 (FEAT-002)** | **T2** | `sonnet` | Renommage mécanique MAIS exhaustivité + discernement critiques (titre vs colonne/badge/enum, admin/staff dupliqués, singulier/pluriel). Trop de jugement contextuel pour Haiku (risque de renommer des `value="PARENT"`). Sonnet sans extended thinking suffit. |

> Tests intégrés dans chaque tâche au niveau de la tâche parente (pas de sur-classement). Aucune tâche T4 (réservé aux agents de jugement : SM/Archi/PO/QA).

---

## 8. Drapeaux de risque

| # | Risque | Story | Mitigation |
|---|--------|-------|------------|
| **R-A** | **Exhaustivité FEAT-002** : rater une occurrence de titre (faux négatif) OU renommer une valeur technique (faux positif sur `value="PARENT"`, enum, colonne). | FEAT-002 | Grep de contrôle avant/après (F5). Liste de fichiers cartographiée §6.3. Règle stricte titre-only. Vérif manuelle sidebar + pages admin/staff dupliquées. |
| **R-B** | **Régression BUG-001 sur TOUS les tableaux server-side** : le fix touche un composant générique consommé par **20 fichiers** (registrations, invoices, payments, refunds, credit-notes, children, camps, parents, staff). Une mémoïsation incorrecte casse la pagination ailleurs que sur les inscriptions. | BUG-001 | Tester ≥2 tables distinctes (registrations + une autre, ex. invoices). Geler contrat props §5.1. Valider les 5 scénarios Gherkin + non-régression pagination (Scénario 5). `eslint exhaustive-deps` en F3. |
| **R-C** | **`select` whitelist FEAT-001** : risque de fuite si `include` brut ou champs sensibles chargés sur `payments`. | FEAT-001 | Whitelist stricte `{ amount, paymentDate, paymentMethod: { select: { name } } }` (CLAUDE.md global §5.9). Pas de `include: { payments: true }`. Vérif `tsc` (F2). |
| **R-D** | **TGC=0 légal** : ne JAMAIS recalculer/corriger le taux (exonération art. LP 492). | FEAT-001 | Bloc paiement purement informatif. Aucun champ de calcul modifié. Garde-fou §5.2. |
| (info) | Aucun risque RLS/EpayNC/migration BDD/breaking change/Pattern B sur ce lot (monolithe sans RLS PostgreSQL, filtrage applicatif Prisma ; pas de paiement EpayNC ici ; pas de schéma Prisma modifié ; pas de service Python). | — | — |

---

## Recommandation au Scrum Master

**Ordre d'exécution conseillé :**
1. **AVANT lancement** : créer les 3 worktrees (commandes §6.2). Hard rule TD-063 : 3 écritures concurrentes = 3 worktrees, même si aucune collision de fichier détectée (sécurité git sur stash/checkout concurrents).
2. **Vague 1** : lancer T1 (`sonnet` + ultrathink), T2 (`sonnet`), T3 (`sonnet`) en parallèle. Chaque agent livre code + tests dans son worktree.
3. **Vague 2 (série, working tree principale)** : merge T2 → T1 → T3, puis `tsc` → `lint` → `build` → grep FEAT-002 → vérif QA.

**Points de vigilance aux GATES de cohérence :**
- **GATE 3 (intégration/finalisation série)** — les 3 à surveiller :
  1. **Exhaustivité FEAT-002** (grep avant/après obligatoire ; zéro titre oublié, zéro valeur technique cassée).
  2. **Non-régression BUG-001 multi-tables** (le fix est sur un composant générique — tester au moins 2 tables différentes, pas seulement les inscriptions).
  3. **`select` whitelist FEAT-001** (`tsc` vert + aucun champ sensible sur `payments` ; TGC=0 intact).
- **Aucune réconciliation de contrat tRPC lourde attendue** : FEAT-001 étend `InvoiceData.payments` (optionnel, rétro-compatible) et un `select` interne au router — pas de changement de signature de procédure exposée. Le `tsc` suffit à valider la cohérence.
- **Si T1 dérive vers un changement d'API** de `DataTableServer`/`useServerPagination` (hors scope défini) : STOP, re-planifier — cela créerait une dépendance vers les 20 consommateurs et invaliderait la parallélisation.

**Taille du lot** : 3 stories × 2 SP = 6 SP, 2 domaines (frontend, backend). Sous les seuils (≤8 SP, ≤3 domaines) — pas de renvoi PO requis.
