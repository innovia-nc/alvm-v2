# Déploiement — ALVM (Vercel + Neon)

> Dernière mise à jour : 2026-07-06 (livraison v2.0.0)

## Topologie

| Élément | Valeur |
|---|---|
| Projet Vercel | `alvm-v2` (team `innovias-projects`, `prj_bbTeuPBTuset2Zfy7mA9muM2Z8pP`) |
| URL de production | https://alvm-v2.vercel.app |
| Repo GitHub | `innovia-nc/alvm-vercel`, branche de prod `master` |
| BDD | **Neon PostgreSQL 17** via l'intégration Vercel ↔ Neon (⚠️ pas Supabase) |
| Stockage fichiers | Vercel Blob (`BLOB_READ_WRITE_TOKEN`) |
| Node / build | 22.x, défauts framework Next.js (pnpm auto-détecté via `pnpm-lock.yaml`) |

## Variables d'environnement (Vercel)

| Variable | Rôle |
|---|---|
| `AUTH_SECRET` | NextAuth v5 — **obligatoire**, fail-closed au boot en prod |
| `POSTGRES_PRISMA_URL` | URL poolée pgbouncer — runtime Prisma (`schema.prisma url`) |
| `POSTGRES_URL_NON_POOLING` | Connexion directe — migrations / `prisma migrate diff` (`directUrl`) |
| `BLOB_READ_WRITE_TOKEN` | Upload des PDF de factures |

Vars legacy présentes mais inutilisées par le code : `NEXTAUTH_*`, `STACK_*`,
`PG*`, `NEON_PROJECT_ID`, `DATABASE_URL` — nettoyage possible après stabilité.

## Déployer

- **Voie normale** : push sur `master` → build auto Vercel (nécessite la
  connexion Git du projet — voir « Incident 2025-11 » ci-dessous).
- **Voie manuelle** : `vercel deploy --prod` depuis la racine du repo
  (projet déjà linké via `.vercel/`). Preview : `vercel deploy` (URLs preview
  protégées par SSO Vercel).

## Migrations de schéma

Stratégie : **`db push` / SQL manuel** — pas de `prisma migrate dev` (base gérée).

1. Générer le diff : `prisma migrate diff --from-url $POSTGRES_URL_NON_POOLING --to-schema-datamodel prisma/schema.prisma --script`
2. Relire chaque instruction (renommages ≠ drop+create ; attention aux `DROP INDEX`
   qui visent des contraintes UNIQUE → `ALTER TABLE … DROP CONSTRAINT`).
3. **Répéter sur un clone** : `pg_dump` de la prod → Postgres Docker local →
   appliquer le script en transaction unique (`psql -1 -v ON_ERROR_STOP=1`) →
   vérifier diff résiduel vide + login + lectures tRPC.
4. Sauvegarder (`pg_dump`) puis appliquer en prod avec le même `psql -1`.
5. Archiver le script dans `prisma/migrations-manual/` (versionné).

Le schéma `neon_auth` (table `users_sync`) appartient à l'intégration Neon —
ne pas y toucher, Prisma l'ignore.

## Incident 2025-11 → 2026-07 (leçon)

Le projet Vercel était lié au repo GitHub `innovia-nc/alvm-v2`, **supprimé** lors
de la création d'`alvm-vercel` : plus aucun déploiement pendant 7 mois, la prod
servait un build du 25 nov. 2025 pendant que les correctifs s'accumulaient sur
`master`. Détection tardive faute de supervision du « dernier déploiement ».
Action : vérifier `vercel ls` (âge du dernier déploiement prod) dans les routines
de supervision, et re-lier la connexion Git à chaque renommage/migration de repo.

> Pipeline Git reconnecté et validé le 2026-07-06 (voir Incident 2025-11).

## Campagne smoke E2E (tests réels sur clone de prod)

Script : `test/e2e-smoke/smoke.mjs` (~40 vérifications). Déroule les flux
d'écriture réels — création parent/enfant/camp, inscription parent, facture
depuis inscription, validation, paiements, remboursement, avoir → crédit,
présences, FEC, PDF — plus les invariants comptables globaux (grand livre
équilibré, aucune écriture 0/0, `paid_amount` = paiements − remboursements)
et le scoping par rôle. **Jamais contre la prod** (le script écrit).

Mise en place du banc :
1. `pg_dump` de la prod → restore dans un Postgres 17 local (port 5445,
   db `neondb`, mdp `smoke`).
2. Créer l'admin de test `smoke-admin@test.local` / `Smoke2026!` (user ADMIN +
   account credentials bcrypt) et donner le mdp `SmokeParent2026!` à un parent
   existant (export `SMOKE_PARENT_EMAIL`).
3. `.env.local` → `postgresql://postgres:smoke@127.0.0.1:5445/neondb` (les
   deux vars) + `AUTH_SECRET` quelconque, puis `pnpm dev`.
4. `pnpm smoke` — code sortie 0 si tout passe.

À lancer avant chaque mise en production significative. Bugs P0 déjà détectés
par cette campagne le 2026-07-06 : TGC 11 % facturée à tort (settings pricing
non seedés), 500 création parent (CHECK code postal), 500 enfant > 18 ans,
remboursement sans recalcul du payé, deadlock confirmation d'inscription payée.
