# Rétrospectives — ALVM

Journal historisé (append-only, jamais écrasé).

## 2026-07-06 — Livraison v2.0.0 (remise en route de la prod)

**Contexte** : signalement « l'application semble buggée sur Vercel ». Diagnostic :
la prod servait un build du 25 nov. 2025 ; le projet Vercel était lié à un repo
GitHub supprimé (`alvm-v2`), branche de prod `main` inexistante — **7 mois de
correctifs jamais déployés** (dont BUG-001, la recherche des inscriptions).

**Écarts constatés / causes racines**
1. *Repo recréé sans re-lier Vercel* : la refonte a démarré dans un nouveau repo
   (`alvm-vercel`, mars 2026) sans reconnecter le projet Vercel ni vérifier le
   pipeline. Aucun signal d'échec : les pushes ne déclenchaient simplement rien.
2. *Pas de supervision du « dernier déploiement »* : personne ne comparait l'âge
   du dernier build prod à l'activité du repo.
3. *`master` poussé rouge* : 11 tests échouaient (10 par fixtures à dates fixes
   sans horloge figée — pourrissement temporel ; 1 par régression authz du
   commit « fermeture des camps » 19ccf9c, décision produit entérinée depuis).
   Violations du gate §6.4 : ni lint câblé (aucune config ESLint), ni tsc sur
   les specs (vitest ne typecheck pas).
4. *Doc infra fausse* : `.env.example` et CLAUDE.md parlaient de Supabase alors
   que la prod est sur Neon depuis l'origine du projet Vercel (nov. 2025).

**Actions correctives livrées**
- Reconnexion du pipeline (reste : Login Connection GitHub côté Vercel, action manuelle).
- ESLint 9 câblé + typage strict (2 bugs latents corrigés) ; dette TD-001 tracée.
- Horloge figée dans les specs temporelles ; règle authz camps actée et testée.
- Migration BDD répétée sur clone avant prod ; procédure documentée (docs/deploiement.md).
- Supervision : ajouter un check `vercel ls` (âge du dernier déploiement) aux
  routines du Mac mini — **à câbler**.
- Repo `alvm-back` archivé (supersédé) pour éviter toute reprise erronée.

**Preuves** : recette prod du 2026-07-06 (login, pages admin, tRPC sur données
réelles, PDF 200 + 401 sans auth, traçabilité FEAT-004) ; diff schéma résiduel
vide ; dump pré-migration conservé (`~/Desktop/alvm-prod-backup-20260706.sql`).

### Addendum 2026-07-06 (post-livraison) — P0 « validation facture à 0 XPF »

Premier retour utilisateur après mise en prod : 500 sur `invoices.validate`.
Cause : contrainte CHECK `check_debit_or_credit` héritée de l'ère triggers —
**invisible pour Prisma** (`migrate diff` ne modélise pas les CHECK), donc hors
du radar de la migration ET des mocks de tests. Les brouillons legacy à 0 XPF
déclenchaient une écriture 0/0 rejetée par Postgres. L'ancien trigger SQL avait
le même défaut : cas jamais exercé avant.

**Pattern réutilisable** : lors d'une reprise de BDD existante, inventorier les
contraintes CHECK/triggers restants (`pg_constraint contype='c'`, `pg_trigger`)
— ils encodent des règles métier que ni Prisma ni les tests unitaires mockés ne
voient. Fix : garde « montant nul » dans les 4 fonctions d'écritures comptables
+ test anti-régression (`invoices.spec` : validation 0 XPF sans écriture).

### Addendum 2026-07-06 (bis) — campagne de tests réels : 4 bugs P0/P1 en plus

Campagne smoke E2E (`pnpm smoke`, banc = clone de prod) montée suite aux deux
premiers P0. Résultat : 41/41 PASS après correction de :
1. **TGC 11 % facturée à tort** (P0 légal) — settings `pricing` jamais seedés en
   prod + fallback codé à 11 alors qu'ALVM est exonérée (LP 492).
2. **500 création parent sans code postal** — CHECK legacy `length=5` sur
   colonne NOT NULL vs contrat applicatif optionnel. Fix : contrainte assouplie
   (`'' OU 5`), Zod 5 chiffres si renseigné.
3. **500 enfant hors tranche d'âge** — CHECK `birth_date` (0–18 ans) non gardé
   par Zod → erreur Postgres brute au lieu d'un message.
4. **Remboursement sans effet sur la facture** — `refunds.create/delete` ne
   recalculaient ni `paid_amount` ni le statut (invariant comptable violé).
5. **Deadlock inscription payée** — facturée/payée en PENDING → confirmation
   refusée → présences impossibles. Fix : payée ⇒ seule la confirmation reste
   permise (annulation via cancelWithAccounting).

**Leçons** : (a) les CHECK/triggers legacy invisibles pour Prisma sont une
source systémique de 500 — inventaire fait, gardes Zod alignées ; (b) les
règles métier « écrites des deux côtés » (BDD + code) doivent être testées en
conditions réelles : les mocks unitaires ne voient rien de tout ça. La campagne
est désormais rejouable avant chaque mise en prod (docs/deploiement.md).
