# Changelog

Toutes les évolutions notables de ce projet sont documentées ici.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).

## [Unreleased]

## [2.0.0] — 2026-07-06

**Première mise en production de la refonte monolithe** sur `alvm-v2.vercel.app`.
La prod tournait depuis le 25 nov. 2025 sur l'ancien repo `alvm-v2` (supprimé) :
le projet Vercel, orphelin de son repo Git, n'avait plus reçu aucun déploiement.
Livraison : les 95 commits de la refonte + les correctifs ci-dessous, avec
migration de la base Neon de prod (données réelles préservées, répétée sur clone
local — voir `prisma/migrations-manual/2026-07-06-alignement-refonte.sql` et
`docs/deploiement.md`).

### Deploy / Infra
- `maxDuration = 60` sur les 4 endpoints générant des PDF (`api/generate/*`, `api/trpc`).
- Prisma : runtime via le pooler pgbouncer Neon (`POSTGRES_PRISMA_URL`), connexion directe réservée aux migrations.
- `AUTH_SECRET` ajouté aux environnements Vercel (NextAuth v5, fail-closed).
- ESLint 9 flat config câblé (aucune config n'existait) ; typage strict rétabli sur le code applicatif — 2 bugs latents corrigés au passage (champ inexistant affiché dans le formulaire de remboursement, date nullable non gardée dans le formulaire d'inscription). Dette restante : TD-001 (`docs/dette-technique.md`).
- Tests : horloge figée dans `registrations.spec` (10 tests pourrissaient avec le temps) ; décision produit — tout STAFF peut modifier tout camp (entérine `19ccf9c`).

### Added
- **FEAT-001** : affichage des modes de règlement (chèque, espèces, aides…) sur la facture PDF, dans un bloc « Modes de règlement » après les totaux.
- **FEAT-002** : libellés des titres de sections renommés en « Parent / Client » et « Enfant / Stagiaire » (espaces staff et admin).
- **FEAT-003** : historique des inscriptions par enfant sur la fiche enfant (contextes admin, staff et parent). Le parent ne voit que ses propres enfants (scope server-side).
- **FEAT-004** : traçabilité interne des factures — « Créé par » / « Validé par » affichés sur le détail facture côté admin/staff. Jamais exposé aux parents ni sur le PDF client. Migration : 2 colonnes optionnelles `created_by_id` / `validated_by_id` sur `invoices` (à appliquer en `prisma migrate deploy` / `db push` — jamais `migrate dev` sur Supabase).

### Fixed
- **BUG-001** : la recherche par saisie de texte dans la liste des inscriptions ne filtrait pas. Cause : référence instable de l'objet retourné par `useServerPagination`, provoquant une boucle de re-render dans `DataTableServer`. Le hook est désormais mémoïsé (useCallback/useMemo) — correction transverse à toutes les tables paginées côté serveur.

### Tests
- Ajout de `test/unit/use-server-pagination.spec.ts` (24 tests) verrouillant la stabilité référentielle du hook `useServerPagination` (anti-régression du fix BUG-001 sur les tables paginées).
