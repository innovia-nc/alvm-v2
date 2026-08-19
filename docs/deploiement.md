# Déploiement — ALVM (Vercel + Neon)

> Dernière mise à jour : 2026-08-19 (§ Échecs de déploiement en preview ; version pnpm figée)

## Topologie

| Élément | Valeur |
|---|---|
| Projet Vercel | `alvm-v2` (team `innovias-projects`, `prj_bbTeuPBTuset2Zfy7mA9muM2Z8pP`) |
| URL de production | https://alvm-v2.vercel.app |
| Repo GitHub | `innovia-nc/alvm-vercel`, branche de prod `master` |
| BDD | **Neon PostgreSQL 17** via l'intégration Vercel ↔ Neon (⚠️ pas Supabase) |
| Stockage fichiers | Vercel Blob (`BLOB_READ_WRITE_TOKEN`) |
| Node / build | 22.x, défauts framework Next.js ; **pnpm figé par `packageManager` dans `package.json`** (voir ci-dessous) |

## Variables d'environnement (Vercel)

| Variable | Rôle |
|---|---|
| `AUTH_SECRET` | NextAuth v5 — **obligatoire**, fail-closed au boot en prod |
| `POSTGRES_PRISMA_URL` | URL poolée pgbouncer — runtime Prisma (`schema.prisma url`) |
| `POSTGRES_URL_NON_POOLING` | Connexion directe — migrations / `prisma migrate diff` (`directUrl`) |
| `BLOB_READ_WRITE_TOKEN` | Upload et suppression des PDF (factures, avoirs, documents) |
| `RESEND_API_KEY` | Envoi des factures/devis par email (TD-008) — **optionnel** : sans elle, les écrans désactivent l'envoi et l'expliquent |

L'identité d'expédition des emails (nom, adresse, reply-to) n'est **pas** une
variable d'environnement : elle se règle dans /dashboard/admin/settings, section
Email. Seul le domaine d'envoi doit être vérifié côté Resend.

Vars legacy présentes mais inutilisées par le code : `NEXTAUTH_*`, `STACK_*`,
`PG*`, `NEON_PROJECT_ID`, `DATABASE_URL` — nettoyage possible après stabilité.

## Version de pnpm — une seule autorité

`package.json` porte `"packageManager": "pnpm@9.15.9"`. Avant le 2026-08-19,
trois environnements installaient avec trois pnpm différents : Vercel en 9
(déduit de `lockfileVersion: 9.0`), le CI GitHub en 10 (épinglé dans le
workflow), les postes de dev en 11. Le champ `packageManager` est lu par les
trois — le workflow n'épingle donc plus de version, et pnpm bascule tout seul
sur la bonne sur un poste de dev.

Ce qui avait été commité entre-temps : un `pnpm-workspace.yaml` contenant les
valeurs **modèles** de `pnpm approve-builds` (« set this to true or false »).
Illisible pour pnpm, donc aucun script d'installation autorisé, donc pas de
`prisma generate` au `postinstall` — le fichier est supprimé.

⚠️ **Si un jour la version est montée à pnpm ≥ 10** : les scripts
d'installation redeviennent bloqués par défaut. Il faut alors déclarer
`onlyBuiltDependencies` (`@prisma/client`, `@prisma/engines`, `prisma`,
`esbuild`, `sharp`, `unrs-resolver`) dans un `pnpm-workspace.yaml` — le champ
`pnpm` de `package.json` n'est **plus lu** par pnpm 10+ (il est ignoré en
silence). Sans cela le build échoue sur un client Prisma absent.

## Échecs de déploiement en preview (constat 2026-08-19)

**Symptôme** : sur `alvm-v2`, la production se déploie normalement mais **toutes
les previews de PR échouent** — y compris des PR qui ne touchent que des
fichiers Markdown, et y compris les #26/#27 mergées ainsi. Le projet
`alvm-vercel` (team `ifingos-projects`, branché sur le même repo) échoue lui
aussi, sur `master`.

**Ce qui est établi, et ce qui l'exclut** :

| Piste | Verdict |
|---|---|
| Régression de code | **Exclue** — `pnpm build` passe en local, et une PR de documentation seule échoue aussi. |
| Build qui réclamerait une variable d'environnement | **Exclue** — le build tourne sans aucune variable : toutes les pages du tableau de bord sont dynamiques (`ƒ`), rien n'interroge la base au prérendu. Une étape `next build` a été ajoutée au CI pour que ce fait reste vrai. |
| Étape d'installation (pnpm) | **Improbable** — l'échec arrive **une seconde** après la création du déploiement (statuts GitHub : créé à 00:13:36, `failure` à 00:13:37). Une installation puis un build prennent des minutes. |

Un échec en une seconde n'est pas un build qui casse : c'est un déploiement
**refusé avant de démarrer**. Les causes habituelles sont toutes côté projet
Vercel, pas côté dépôt :

1. une variable d'environnement de l'environnement *Preview* qui référence un
   secret/store supprimé (cas classique après un débranchement de l'intégration
   Neon : « references Secret … which does not exist ») ;
2. un quota ou une facturation de l'équipe qui interdit les déploiements de
   preview ;
3. une intégration (Neon) qui échoue à créer la branche de base de données du
   preview.

**Diagnostic — trois commandes, à lancer avec un compte Vercel** (le dépôt ne
porte aucun jeton, ces commandes ne peuvent pas être jouées depuis le CI) :

```bash
npx vercel login
npx vercel inspect dpl_5w3TtrEmDsGV5q6qsGWDiCQwD4iY --logs   # dernier preview en échec
npx vercel env ls preview                                    # comparer avec `vercel env ls production`
```

La première ligne de sortie de `inspect` donne le motif exact ; c'est elle qui
départage les trois causes ci-dessus. Tant qu'elle n'est pas lue, toute
modification du dépôt serait une correction à l'aveugle — d'où le choix de
n'avoir rien changé au code applicatif pour ce point, et d'avoir seulement
ajouté le filet manquant (build en CI) et supprimé la vraie anomalie trouvée en
chemin (le `pnpm-workspace.yaml` modèle).

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

## Données de référence (seeds)

| Commande | Contenu | Quand |
|---|---|---|
| `pnpm db:seed` | jeu de démonstration complet (admin, parents, enfants, camps, inscriptions, `app_settings`, types d'ACM) | base de dev / clone jetable **uniquement** — il crée des comptes de test |
| `pnpm db:seed:payment-methods` | les 6 moyens de paiement système (`CASH`, `CHECK`, `BANK_TRANSFER`, `CREDIT_CARD`, `OTHER`, `CREDIT_NOTE`) et leurs codes comptables | **toute base neuve, prod comprise** — idempotent (upsert sur `code`), rejouable |

`pnpm db:seed` ne crée **aucun** moyen de paiement : les deux seeds ne se
recouvrent pas. Sans le second, une base est fonctionnelle jusqu'au premier
encaissement, puis `credit-application.service.ts` refuse la validation d'une
facture d'un client qui a des avoirs — `PRECONDITION_FAILED`, « Méthode de
règlement « Avoir » (CREDIT_NOTE) introuvable ». Le seed est la réponse à ce
message ; jusqu'à la sixième passe de code mort il n'était référencé nulle part.

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

## Recette visuelle complète (Playwright + Chrome)

En complément de la campagne smoke (API/invariants), une **recette de bout en
bout simule les parcours utilisateurs** dans le navigateur — une capture d'écran
par critère, mappée sur les 8 guides utilisateurs (connexion/habilitations,
camps, familles, inscriptions, présences, facturation/paiements, FEC), personas
ADMIN et PARENT.

- Spec + config + preuves : `docs/test-evidence/recette-v2.0.1/`
  (`acceptance.spec.ts`, `playwright.config.ts`, 20 captures, `rapport.md`).
- Sur le **même banc** que le smoke (clone de prod, Postgres jetable `alvm-smoke`,
  `pnpm dev`), lancer :
  ```bash
  pnpm recette
  ```
- Le spec résout quelques ids (facture, camp) et vérifie les écritures
  comptables via `docker exec alvm-smoke psql …` — **usage recette uniquement,
  jamais contre la prod**.

Dernière exécution : **19/19 PASS** le 2026-07-06 (rapport
`docs/test-evidence/recette-v2.0.1/rapport.md`).
