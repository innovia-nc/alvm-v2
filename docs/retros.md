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
