# PLAN D'EXÉCUTION — LOT B : FEAT-003 (Historique inscriptions/enfant) + FEAT-004 (Traçabilité factures)

> Architecte logiciel — ALVM Vercel (monolithe Next.js 15 App Router + tRPC 11 + Prisma 6 + NextAuth v5, BDD Supabase).
> Livrable d'analyse/planification. Aucun code applicatif écrit ici. Le Scrum Master exécute ce plan via sous-agents.

## Synthèse
- **Nb de tâches** : 7 (T1→T7) + 2 tâches de finalisation série (F1, F2)
- **Nb de vagues** : 3 vagues parallèles
- **Tâches en finalisation série** : 2 (réconciliation types tRPC `tsc` ; build + checklist non-exposition parent/PDF)
- **Worktrees requis** : 2 — `/tmp/innovia/alvm-feat003-histo` (FEAT-003) et `/tmp/innovia/alvm-feat004-traca` (FEAT-004), car écritures concurrentes dans la même vague (TD-063).
- **Sous-séquence FEAT-004** : DBA (schéma+migration) → Backend (remplissage+select role-gated) → Frontend (affichage admin/staff). Stricte et interne à la story.
- **Risques majeurs** : (1) fuite cross-parent FEAT-003 ; (2) exposition creator/validator au parent/PDF FEAT-004 ; (3) `select` whitelist (jamais `email`/`hashedPassword` via creator/validator — uniquement `id, firstName, lastName`) ; (4) migration réversible sans `migrate dev` ; (5) N+1 sur l'historique.

---

## Vérifications de triage (faites sur le code réel)

- **FEAT-003 back EXISTE et SUFFIT** : `server/routers/registrations.ts` → `list` (`protectedProcedure`) accepte `childId` (L173), applique le scope parent (`if (ctx.user.role === 'PARENT') where.parentId = ctx.user.id`, L188-190), supporte `sortBy: 'registrationDate'` + `sortOrder: 'desc'` (R2) et la pagination (`limit`/`offset`). **Aucune nouvelle procédure, aucune migration.** On consomme `registrations.list({ childId, sortBy:'registrationDate', sortOrder:'desc', limit })`.
- **`server/routers/children.ts`** : aucune proc ne renvoie d'inscriptions → confirmé, on ne touche pas children.ts (on passe par registrations.list).
- **`components/admin/children/child-details.tsx`** existe (partagé admin + staff). **Page parent** = `app/dashboard/parent/children/[id]/page.tsx` (SSR autonome).
- **FEAT-004 invoices** : `create` (L264, `staffProcedure`), `createFromRegistration` (L320, `staffProcedure`), `validate` (L516, `staffProcedure`, `tx.invoice.update` L534 avec `ctx.user.id` déjà dispo L575). `getById` (L243) est **`protectedProcedure` partagé parent+staff** (scope parent L252-254) → **point de vigilance R3** : le mapping creator/validator doit être role-gated.
- **`invoiceInclude` / `mapInvoiceWithDetails` / `invoiceWithDetailsSchema`** (L52-150) : structure connue, extension propre possible.
- **Pas de dossier `prisma/migrations/` committé** → le projet est géré en `prisma db push` (cohérent CLAUDE.md). La migration FEAT-004 = édition du `schema.prisma` + SQL de référence + application au déploiement par `migrate deploy`/`db push`. Pas de DB locale (build sur placeholders) → validation par `prisma validate` + `prisma generate` + revue SQL.
- **Pattern de traçabilité existant** (cohérence nommage) : `User` porte déjà `createdCamps @relation("CampCreator")`, `recordedPayments @relation("PaymentRecorder")`, `createdAccountingEntries @relation("EntryCreator")`. On suit ce style.

---

## 1. Tâches atomiques

| ID | Titre | Story | Domaine → agent | Périmètre fichiers | Type | Modèle |
|----|-------|-------|-----------------|--------------------|------|--------|
| **T1** | Schéma Prisma + migration traçabilité Invoice | FEAT-004 | `dba` | `prisma/schema.prisma` (Invoice + User) ; SQL de migration de référence + down | Écriture | **T3** (sonnet + think hard) |
| **T2** | Composant historique inscriptions (réutilisable) | FEAT-003 | `frontend` | `components/admin/children/child-registrations-history.tsx` (nouveau) | Écriture | **T2** (sonnet) |
| **T3** | Backend remplissage + select role-gated creator/validator | FEAT-004 | `backend` | `server/routers/invoices.ts` (`create`, `createFromRegistration`, `validate`, `invoiceInclude`, `invoiceWithDetailsSchema`, `mapInvoiceWithDetails`) | Écriture | **T3** (sonnet + think hard — sécurité/role-gating) |
| **T4** | Injection historique fiches admin/staff | FEAT-003 | `frontend` | `components/admin/children/child-details.tsx` | Écriture | **T2** (sonnet) |
| **T5** | Injection historique page parent (SSR createCaller) | FEAT-003 | `frontend` | `app/dashboard/parent/children/[id]/page.tsx` | Écriture | **T2** (sonnet) |
| **T6** | Affichage Créé par / Validé par sur détail facture | FEAT-004 | `frontend` | `components/admin/invoices/invoice-details.tsx` | Écriture | **T1** (haiku — 2 lignes d'affichage + placeholder) |
| **T7** | Tests : isolation parent (FEAT-003) + remplissage IDs / non-exposition (FEAT-004) | FEAT-003 + FEAT-004 | `backend` (qa) | `test/unit/registrations.spec.ts`, `test/unit/invoices.spec.ts` | Écriture | **T3** (sonnet + think hard — tests sécurité/isolation) |

> Justifications modèle :
> - **T1 (T3)** : conception relations Prisma + migration réversible + non-régression schéma facturation = décision structurante.
> - **T3 (T3)** : role-gating de l'exposition (parent ne doit jamais voir creator/validator) = sécurité, pas du CRUD trivial.
> - **T6 (T1)** : purement mécanique (2 libellés + placeholder "Non renseigné"), Haiku suffit.
> - **T2/T4/T5 (T2)** : composant UI standard + injections, sans logique sensible (le scope est garanti back).
> - **T7 (T3)** : les tests d'isolation cross-parent et de non-exposition sont la garantie de sécurité du lot.

---

## 2. DAG de dépendances

```
FEAT-004 (sous-séquence dure, contract-first sur les noms de champs gelés §5) :
  T1 (dba schéma+migration)
     └──► T3 (backend remplissage + select)        [dur : a besoin des champs Prisma générés]
              └──► T6 (front affichage détail)      [dur : a besoin du shape de getById]

FEAT-003 (front-dominant, back déjà gelé) :
  T2 (composant historique)                          [aucune dép — contrat tRPC registrations.list déjà figé]
     ├──► T4 (injection admin/staff)                 [dur : importe le composant T2]
     └──► T5 (injection parent SSR)                  [dur : importe le composant T2]

T7 (tests) dépend de T3 (logique remplissage/select) et de la dispo de T1.
  → T7 démarre après T3 (FEAT-004) ; le volet FEAT-003 de T7 (isolation) peut démarrer dès le contrat back (déjà figé), mais on le groupe avec T3 fait pour rester une seule tâche atomique.
```

Distinction dépendances :
- **Dures** : T3→T1 (Prisma Client régénéré), T6→T3 (shape getById), T4→T2 et T5→T2 (import composant).
- **Faibles levées par contrat gelé** : T2 ne dépend de RIEN car `registrations.list` est figé (§5). T3 peut écrire la logique de remplissage **contre les noms de champs gelés** sans attendre que T1 soit mergé, MAIS Prisma Client doit être régénéré pour que `tsc` passe → on garde T3 après T1 dans la même story (sous-séquence courte, faible coût). Inter-stories : **FEAT-003 et FEAT-004 sont 100% indépendantes** (fichiers disjoints) → parallélisables.

---

## 3. Vagues parallèles (≤16)

```
Vague 1  (2 écritures concurrentes → worktrees dédiés) :
   T1 (dba, FEAT-004)   ∥   T2 (frontend, FEAT-003)
   worktree alvm-feat004-traca        worktree alvm-feat003-histo

Vague 2  (2 écritures concurrentes → worktrees dédiés) :
   T3 (backend, FEAT-004)   ∥   T4 (frontend, FEAT-003)  ∥  T5 (frontend, FEAT-003)
   worktree alvm-feat004-traca        worktree alvm-feat003-histo (T4 & T5 = même story, fichiers disjoints, même worktree OK)

Vague 3 :
   T6 (frontend, FEAT-004)   ∥   T7 (tests, FEAT-003+FEAT-004)
   worktree alvm-feat004-traca (T6)   ;  T7 lecture+tests : worktree alvm-feat004-traca recommandé (touche test/ des 2 stories après merge logique)
```

Notes vagues :
- **T4 et T5** sont dans la même story (FEAT-003), touchent des fichiers **disjoints** (`child-details.tsx` vs `page.tsx`) → un seul worktree FEAT-003, pas de collision. Peuvent être confiées à un seul agent frontend séquentiellement ou deux agents si le SM les sépare — dans ce cas même worktree mais fichiers disjoints, OK (jamais 2 écritures sur le MÊME fichier).
- Limite ≤16 largement respectée (max 3 concurrents).

---

## 4. Queue de finalisation série (working tree principale, par le SM)

| ID | Action | Détail |
|----|--------|--------|
| **F1** | Merge worktrees → main + réconciliation types tRPC | Merger `alvm-feat004-traca` puis `alvm-feat003-histo`. Régénérer Prisma Client (`prisma generate`). `tsc` (back/server d'abord car le type `getById` change, puis front qui consomme `RouterOutput`). Corriger toute divergence résiduelle creator/validator. |
| **F2** | Build + checklist sécurité + migration | `pnpm build` (Next). Vérifier checklist non-exposition (parent + PDF) FEAT-004. Lancer `prisma validate` + revue SQL migration. Application schéma au déploiement via `prisma migrate deploy` / `db push` (jamais `migrate dev` — Supabase). Exécuter `test/unit` (isolation + remplissage). |

> Ordre de merge : **FEAT-004 d'abord** (migration + changement de type tRPC `getById`), puis FEAT-003 (consomme un contrat déjà figé, aucun impact schéma).

---

## 5. Contrats gelés (CONTRACT-FIRST) — NE JAMAIS RENOMMER

### 5.1 Schéma Prisma FEAT-004 (figé par l'architecte, livré par `dba` en T1)

Sur **`model Invoice`** — 2 champs optionnels + 2 relations nommées :
```prisma
createdById   String? @map("created_by_id")   @db.Uuid
validatedById String? @map("validated_by_id") @db.Uuid

creator   User? @relation("InvoiceCreator",   fields: [createdById],   references: [id], onDelete: SetNull)
validator User? @relation("InvoiceValidator", fields: [validatedById], references: [id], onDelete: SetNull)
```
Sur **`model User`** — relations inverses :
```prisma
createdInvoices   Invoice[] @relation("InvoiceCreator")
validatedInvoices Invoice[] @relation("InvoiceValidator")
```
- Noms de relation **EXACTS** : `"InvoiceCreator"` / `"InvoiceValidator"`.
- Champs scalaires **EXACTS** : `createdById`, `validatedById` (colonnes `created_by_id`, `validated_by_id`).
- Inverses **EXACTS** : `createdInvoices`, `validatedInvoices`.
- `onDelete: SetNull` (un user supprimé ne casse pas la facture ; cohérent avec champs optionnels R1).
- Migration **réversible** : up = `ALTER TABLE invoices ADD COLUMN created_by_id uuid NULL ...` + FK ; down = `DROP CONSTRAINT` + `DROP COLUMN`.

### 5.2 Signatures tRPC FEAT-004 (figées, livrées par `backend` en T3)

- `invoices.create` / `invoices.createFromRegistration` (`staffProcedure`) : ajoutent `createdById: ctx.user.id` dans le `data` du `tx.invoice.create`. Output `invoiceSchema` inchangé.
- `invoices.validate` (`staffProcedure`) : ajoute `validatedById: ctx.user.id` au `data` du `tx.invoice.update` (L534) — **sans toucher `createdById`** (R2, jamais écrasé). Output `invoiceSchema` inchangé.
- `invoices.getById` (`protectedProcedure`, partagé parent+staff) : **role-gated**.
  - `invoiceInclude` étendu avec `select` **whitelist stricte** :
    ```ts
    creator:   { select: { id: true, firstName: true, lastName: true } },
    validator: { select: { id: true, firstName: true, lastName: true } },
    ```
    > **Sur le modèle `User`** : `firstName`/`lastName` ne sont pas sur `User` mais sur `StaffMember`/`Parent`. Le `dba`/`backend` doit donc soit (a) sélectionner `name` sur `User` (`creator: { select: { id: true, name: true } }`), soit (b) joindre `staffMember: { select: { firstName, lastName } }`. **Contrat figé = exposer un libellé `creatorName: string | null` / `validatorName: string | null` dérivé côté mapping** (le worker choisit la source `name` ou `staffMember`, mais l'output exposé est `creatorName`/`validatorName`). JAMAIS `email`, `hashedPassword`, tokens.
  - `invoiceWithDetailsSchema` étendu : `creatorName: z.string().nullable()`, `validatorName: z.string().nullable()`.
  - `mapInvoiceWithDetails` : ne renseigne `creatorName`/`validatorName` **que si `ctx.user.role !== 'PARENT'`** ; sinon `null` (R3). → le mapping reçoit le rôle en argument, ou getById nullifie avant retour pour les parents.

### 5.3 Contrat tRPC FEAT-003 (DÉJÀ FIGÉ — existant, ne pas modifier)

- `registrations.list` (`protectedProcedure`), appel figé :
  ```ts
  registrations.list({ childId: <uuid>, sortBy: 'registrationDate', sortOrder: 'desc', limit: 50, offset: 0 })
  ```
  Output : `{ registrations: RegistrationWithDetails[], total: number }`. Scope parent appliqué côté serveur (sécurité garantie).

### 5.4 Props du nouveau composant FEAT-003 (figées, livrées par `frontend` en T2)

Fichier : `components/admin/children/child-registrations-history.tsx`
```ts
interface ChildRegistrationsHistoryProps {
  childId: string;
  // Option SSR parent : données pré-chargées via createCaller pour éviter un fetch client
  initialData?: { registrations: RegistrationListItem[]; total: number };
}
```
- Tri R2 (récent d'abord) appliqué via l'appel (`sortOrder:'desc'`) ou re-tri défensif client.
- État vide explicite : « Aucune inscription » (Scénario 2).
- Statut affiché en **badge/libellé lisible** (Scénario 5) — réutiliser le `StatusBadge` existant (commit `c62f951`) plutôt qu'afficher la valeur brute.
- **Admin/staff (T4)** : usage client (hook tRPC `useQuery`).
- **Parent (T5)** : SSR → `createCaller` (`lib/trpc/server.ts`) passe `initialData` au composant.

---

## 6. Carte de contention + worktrees

| Tâche | Fichiers écrits | Story |
|-------|-----------------|-------|
| T1 | `prisma/schema.prisma` | FEAT-004 |
| T3 | `server/routers/invoices.ts` | FEAT-004 |
| T6 | `components/admin/invoices/invoice-details.tsx` | FEAT-004 |
| T2 | `components/admin/children/child-registrations-history.tsx` (nouveau) | FEAT-003 |
| T4 | `components/admin/children/child-details.tsx` | FEAT-003 |
| T5 | `app/dashboard/parent/children/[id]/page.tsx` | FEAT-003 |
| T7 | `test/unit/registrations.spec.ts`, `test/unit/invoices.spec.ts` | les 2 |

**Collisions inter-tâches** : AUCUNE collision de fichier. Les deux stories touchent des ensembles **strictement disjoints** (FEAT-004 = prisma/invoices/invoice-details ; FEAT-003 = children/registrations-history/page parent). FEAT-003 ne touche PAS registrations.ts (lecture seule via le contrat figé).

**Worktrees (règle TD-063 — écritures concurrentes dans une même vague)** :
- `/tmp/innovia/alvm-feat004-traca` → branche `feat/alvm-traca-factures` → T1, T3, T6, (T7 invoices).
- `/tmp/innovia/alvm-feat003-histo` → branche `feat/alvm-histo-inscriptions` → T2, T4, T5, (T7 registrations).
- Créés **AVANT** lancement des agents :
  ```
  git worktree add /tmp/innovia/alvm-feat004-traca feat/alvm-traca-factures
  git worktree add /tmp/innovia/alvm-feat003-histo feat/alvm-histo-inscriptions
  ```
- T4 et T5 partagent le worktree FEAT-003 (même story, fichiers disjoints) — jamais 2 agents sur le MÊME fichier.
- Nettoyage post-merge : `git worktree remove ...` après F1/F2.

---

## 7. Niveau de modèle par tâche (récap)

| Tâche | Niveau | Modèle SM | Mot-clé thinking |
|-------|--------|-----------|------------------|
| T1 (dba schéma/migration) | T3 | `sonnet` | `think hard` |
| T2 (composant histo) | T2 | `sonnet` | — |
| T3 (backend select role-gated) | T3 | `sonnet` | `think hard` (sécurité/role-gating) |
| T4 (injection admin/staff) | T2 | `sonnet` | — |
| T5 (injection parent SSR) | T2 | `sonnet` | — |
| T6 (affichage détail facture) | T1 | `haiku` | — |
| T7 (tests isolation/exposition) | T3 | `sonnet` | `think hard` |

---

## 8. Drapeaux de risque

| Risque | Story | Mitigation / Vérification au gate |
|--------|-------|-----------------------------------|
| **Fuite cross-parent** (parent voit l'historique d'un enfant non rattaché) | FEAT-003 | Scope `where.parentId = ctx.user.id` déjà back. NE PAS contourner côté SSR parent (passer par `registrations.list` via createCaller avec le contexte du parent, pas un appel admin). Test d'isolation obligatoire (T7, Scénario 4). |
| **Exposition creator/validator au parent / sur PDF** | FEAT-004 | `getById` role-gated : `creatorName`/`validatorName` = `null` si `role === 'PARENT'` (R3). Aucun ajout dans le générateur PDF ni dans la fiche parent. Test de non-exposition (T7, Scénario 5). |
| **`select` whitelist (§5.9)** | FEAT-004 | Sur `creator`/`validator` : exposer UNIQUEMENT un libellé nom (via `User.name` ou `staffMember.firstName/lastName`). JAMAIS `email`, `hashedPassword`, `Account.providerAccountId` (hash bcrypt). Aucun `include:{ creator:true }` brut. |
| **Migration réversible / Supabase** | FEAT-004 | Champs **optionnels** (pas de backfill, R1, retro-compat Scénario 4). `prisma validate` + `prisma generate` + revue SQL (pas de DB locale). Application au déploiement par `migrate deploy`/`db push`, **jamais `migrate dev`** (CLAUDE.md). Down testé sur revue : DROP COLUMN + DROP FK. Snapshot OVH non requis (Supabase) mais snapshot Supabase recommandé avant `db push` prod. |
| **N+1 sur l'historique** | FEAT-003 | `registrations.list` charge déjà camp/child/parent/invoice via un seul `include` + `count` en `Promise.all` → pas de N+1. Limiter `limit` (50) ; pagination simple seulement si volume élevé (hors périmètre). |
| **Optimistic locking facture** | FEAT-004 | T3 ajoute `validatedById` dans `validate` qui fait `update` direct (pas `updateMany({version})`) — comportement actuel préservé, ne PAS introduire de régression sur `version`. |
| **Type tRPC bout-en-bout** | FEAT-004 | `getById` change de shape → builder back/server AVANT front en F1 (régénérer Prisma Client d'abord). |

---

## Recommandation au Scrum Master

**Ordre d'exécution conseillé :**
1. Créer les 2 worktrees AVANT tout lancement (TD-063).
2. **Vague 1** : T1 (dba, worktree traca, `sonnet`+`think hard`) ∥ T2 (frontend, worktree histo, `sonnet`).
3. **Vague 2** : T3 (backend, worktree traca, `sonnet`+`think hard`) ∥ T4 + T5 (frontend, worktree histo, `sonnet`). T3 démarre une fois T1 livré (Prisma Client régénérable).
4. **Vague 3** : T6 (frontend, `haiku`) ∥ T7 (tests, `sonnet`+`think hard`).
5. **Finalisation série** F1 puis F2 (merge traca d'abord, puis histo ; `prisma generate` → `tsc` back→front → build → tests → checklist non-exposition).

**Points de vigilance aux gates de cohérence :**
- **GATE 3 (sécurité/exposition)** — les 2 risques à surveiller en priorité :
  1. **FEAT-003** : test d'isolation cross-parent VERT (un parent ne peut pas lire l'historique d'un enfant non rattaché). Vérifier que la page parent SSR passe par le contexte parent, pas un caller admin.
  2. **FEAT-004** : `creatorName`/`validatorName` ABSENTS de la réponse `getById` quand `role === 'PARENT'` ET absents du PDF. `select` whitelist sans `email`/hash.
- **Cohérence des noms gelés** (§5) : vérifier que les workers n'ont pas renommé `createdById`/`validatedById`/`InvoiceCreator`/`InvoiceValidator`/`createdInvoices`/`validatedInvoices`, ni le composant `child-registrations-history.tsx`.
- **Migration** : confirmer que rien n'a déclenché `prisma migrate dev` ; application prévue en `migrate deploy`/`db push` au déploiement, champs optionnels (retro-compat Scénario 4).

**Note de cadrage** : Lot B = 8 SP (5+3), 2 domaines techniques croisés (front + dba/back), fichiers disjoints → pas de signal XL, pas de renvoi PO nécessaire.
