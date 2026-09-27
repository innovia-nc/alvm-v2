# Déploiement — staging srv-innovia, production srv-ovh

> Réécrit le 2026-09-27 pour la refonte SaaS multi-tenant : **trois processus,
> deux images** (front Next.js, back NestJS + worker d'emails), PostgreSQL 16
> avec deux rôles, Redis 7. Remplace l'image unique précédente (`db-init`) et
> Vercel + Neon (`docs/deploiement.md`, obsolète). Base **neuve** : aucune
> reprise de données.

| Environnement | Hôte                          | Orchestration                                 | Accès                        |
| ------------- | ----------------------------- | --------------------------------------------- | ---------------------------- |
| Staging       | srv-innovia (`192.168.0.252`) | Docker Compose — `deploy/staging/compose.yml` | tailnet (`tailscale serve`)  |
| Production    | srv-ovh (`51.68.127.157`)     | Coolify v4 — une ressource par service        | Public, Cloudflare → Traefik |
| Référence     | tout hôte Docker              | `compose.ovh.yml` (racine)                    | —                            |

`compose.ovh.yml` décrit la topologie de production de façon exécutable (mêmes
images, variables et alias réseau que les réglages Coolify ci-dessous). Il sert
de répétition « comme en prod » (§ 8) ; en production, Coolify gère chaque
service séparément (bases sauvegardées, Watch Paths par application).

## 1. Topologie

```
Navigateur ──HTTPS──▶ Cloudflare (proxy) ──▶ Traefik (Coolify) ──▶ front :3000  (seul service public)
                                                                     │ relais /api/{trpc,documents,generate,upload}
                                                                     │ NextAuth → /api/internal/auth/*
                                                                     │ (en-tête x-internal-secret)
                                                                     ▼
                                   back :4001 (alias réseau `alvm-back`, aucun domaine)
                                     │ enqueue                        │ transaction RLS
                                     ▼                                ▼
                                  Redis 7 ──▶ worker ─────────▶ PostgreSQL 16 (rôle alvm_app)
                                                │
                                                └──▶ API Resend (emails)
Sortant (HTTPS) : back et worker → API Resend, Vercel Blob.
```

| Service  | Image                               | Processus                        | Port | Exposition                        |
| -------- | ----------------------------------- | -------------------------------- | ---- | --------------------------------- |
| front    | `asso-saas-front:<sha>`             | `node alvm-front/server.js`      | 3000 | public, via Traefik uniquement    |
| back     | `asso-saas-back:<sha>`              | `serve` → `node dist/main.js`    | 4001 | réseau interne, alias `alvm-back` |
| worker   | `asso-saas-back:<sha>` (même image) | `worker` → `node dist/worker.js` | —    | aucune                            |
| postgres | `postgres:16-alpine`                | —                                | 5432 | réseau interne, jamais publié     |
| redis    | `redis:7-alpine`                    | —                                | 6379 | réseau interne, jamais publié     |

Le back refuse toute requête sans `x-internal-secret` (sauf `/api/health`) :
même joignable sur le réseau Docker, il ne répond qu'au front
(`docs/adr/0001-monorepo-nestjs.md`). Le front ne touche jamais la base.

## 2. Images

Contexte de build = **racine du monorepo** (`.dockerignore` racine), tag = SHA
court du commit, jamais `latest` :

```bash
TAG=$(git rev-parse --short HEAD)
docker build -f alvm-back/Dockerfile  -t asso-saas-back:$TAG  .
docker build -f alvm-front/Dockerfile -t asso-saas-front:$TAG .
```

Les deux Dockerfile n'utilisent aucune syntaxe réservée à BuildKit : ils se
construisent avec n'importe quel client Docker (Coolify compris). La CI les
construit à chaque PR, sans les pousser (`.github/workflows/ci.yml`, job
`images`).

### Back (`alvm-back/Dockerfile`)

Build tsup (`dist/main.js`, `dist/worker.js`, `dist/scripts/*.js`,
`@alvm/shared` embarqué), dépendances de production isolées par
`pnpm deploy --prod`, client Prisma généré pour ce `node_modules`, CLI Prisma à
la **version exacte du client** (lue dans le lockfile), schéma + migrations de
`packages/shared/prisma` copiés dans `/app/prisma` (`PRISMA_SCHEMA`).

| Commande (`docker run <image> <cmd>`) | Effet                                                                                                                                                                                                      |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `serve` (défaut)                      | API NestJS sur `$PORT` (4001). **Aucune** migration au démarrage. Refuse de démarrer si `DATABASE_URL` est superuser ou BYPASSRLS (production)                                                             |
| `worker`                              | Consommateur de la file `alvm-email` (BullMQ). Sans argument, `ALVM_PROCESS=worker` produit le même effet (application Coolify, qui ne sait pas changer la commande d'une image)                           |
| `migrate`                             | `prisma migrate deploy` avec `DATABASE_MIGRATION_URL` (propriétaire), puis droits DML du rôle de `DATABASE_URL` ; refuse si ce rôle est superuser/BYPASSRLS ou identique au propriétaire. Idempotent       |
| `create-super-admin`                  | Espace de plateforme (s'il manque) + un compte `SUPER_ADMIN` — `DATABASE_URL`, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` (12+ caractères, majuscule, minuscule, chiffre). Refuse une adresse déjà connue |

### Front (`alvm-front/Dockerfile`)

`next build` en sortie standalone (`NEXT_OUTPUT=standalone`,
`SKIP_ENV_VALIDATION=1` **au build seulement**). `outputFileTracingRoot` est la
racine du monorepo : le serveur est `alvm-front/server.js`. L'environnement est
validé au démarrage (`instrumentation.ts`) : une variable manquante empêche le
serveur de se préparer — le processus reste en vie mais répond 500 partout, la
sonde échoue et le conteneur devient `unhealthy` (vérifié ; Coolify ne bascule
alors pas le trafic). Le back, lui, s'arrête (code 1).

### Communs

- Utilisateur non-root `node` (uid 1000) ; fichiers applicatifs en lecture
  seule, seul `/tmp` (et le cache de Next) est inscriptible ; `node` en PID 1
  (signaux transmis, arrêt propre).
- Conteneurs en UTC (pas de `TZ` : Alpine n'a pas `tzdata`).
- Sondes (`HEALTHCHECK`) de **liveness**, sans dépendance à la base :
  `GET /api/health` (front et back). Le worker, qui n'écoute aucun port, est
  vivant tant que son processus tourne. Readiness de la base :
  `GET /api/health?db=1` sur le back (503 si la base est injoignable).
- `SOURCE_COMMIT` (optionnel) est renvoyé par `/api/health` (`version`).

## 3. Base de données : deux rôles

| Rôle         | Privilèges                                        | Utilisé par                                         |
| ------------ | ------------------------------------------------- | --------------------------------------------------- |
| propriétaire | superuser de l'image postgres, owner du schéma    | `migrate` uniquement (`DATABASE_MIGRATION_URL`)     |
| `alvm_app`   | `NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE` | back, worker, `create-super-admin` (`DATABASE_URL`) |

- `deploy/postgres/init-app-role.sh` crée `alvm_app` (mot de passe lu dans
  `ALVM_APP_DB_PASSWORD`, jamais sur une ligne de commande) et lui donne
  `CONNECT`. Monté dans `/docker-entrypoint-initdb.d/` (compose), il s'exécute
  **une fois**, à la création du volume ; rejoué à la main (Coolify, § 6.3), il
  est idempotent et remet le rôle en conformité.
- Les droits sur les tables sont posés par `migrate` après chaque migration.
- Toutes les tables métier sont sous RLS forcée : sans contexte, `alvm_app` ne
  voit **aucune** ligne (vérifié : 0 association visible contre 2 pour le
  propriétaire, § 8).
- Mots de passe inclus dans une URL : `openssl rand -hex 32` (rien à échapper).
- ⚠️ Si l'initialisation échoue au premier démarrage, l'image postgres ne la
  rejoue pas : le volume existe, la base démarre **sans** `alvm_app`. `migrate`
  le détecte (« Le rôle applicatif « alvm_app » n'existe pas ») ; supprimer le
  volume neuf et recommencer, ou jouer le script à la main.

## 4. Variables d'environnement

Détail et exemples de chaque service : `alvm-back/.env.example` (validées par
`src/config/env.ts`) et `alvm-front/.env.example` (validées par `lib/env.ts`).
`NODE_ENV=production` et les ports sont posés par les images.

| Variable                                                 | front | back | worker | migrate | Note                                                                                                                                                                            |
| -------------------------------------------------------- | :---: | :--: | :----: | :-----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                           |       |  ✅  |   ✅   |   ✅    | Rôle `alvm_app` : `postgresql://alvm_app:<mdp>@<hôte-postgres>:5432/<base>`. Aussi pour `create-super-admin`                                                                    |
| `DATABASE_MIGRATION_URL`                                 |       |      |        |   ✅    | Propriétaire du schéma. **Jamais** dans le back ni le worker en service                                                                                                         |
| `AUTH_SECRET`                                            |  ✅   |  ✅  |   ✅   |         | `openssl rand -base64 32`, **identique** front/back (le back déchiffre le cookie de session), distinct par environnement                                                        |
| `INTERNAL_API_SECRET`                                    |  ✅   |  ✅  |   ✅   |         | `openssl rand -hex 32`, **identique** front/back                                                                                                                                |
| `AUTH_URL`                                               |  ✅   |  ✅  |   ✅   |         | URL publique du front, sans slash final (cookies `__Secure-` en HTTPS, liens des emails)                                                                                        |
| `API_INTERNAL_URL`                                       |  ✅   |      |        |         | `http://alvm-back:4001`                                                                                                                                                         |
| `TRUSTED_PROXY_HOPS`                                     |  ✅   |      |        |         | **Contrôle de sécurité.** Cloudflare proxy + Traefik : `2` ; staging (`tailscale serve`) : `1`. Mal réglé, un appelant choisit son IP et contourne la limitation des connexions |
| `PLATFORM_ENCRYPTION_KEY`                                |       |  ✅  |   ✅   |         | `openssl rand -base64 32`, requis en production. **À sauvegarder** hors du serveur : la perdre rend illisibles les clés API saisies en super administration                     |
| `REDIS_URL`                                              |       |  ✅  |   ✅   |         | `redis://:<mdp>@<hôte-redis>:6379` (Coolify : `redis://default:<mdp>@…`), requis en production                                                                                  |
| `EMAIL_FROM_ADDRESS`                                     |       |  ✅  |   ✅   |         | Expéditeur par défaut (domaine vérifié chez Resend) ; surchargeable par association                                                                                             |
| `RESEND_API_KEY`                                         |       |  ✅  |   ✅   |         | Optionnelle (surchargeable en super administration). Absente : envoi désactivé et expliqué à l'écran                                                                            |
| `BLOB_READ_WRITE_TOKEN`, `BLOB_PRIVATE_READ_WRITE_TOKEN` |       |  ✅  |   ✅   |         | Vercel Blob (API par jeton, fonctionne hors Vercel), stores **distincts** par environnement. Sans jeton : pas de logo ni de documents                                           |
| `SOURCE_COMMIT`                                          |  ✅   |  ✅  |   ✅   |         | Optionnel : SHA affiché par `/api/health`                                                                                                                                       |
| `ALVM_PROCESS`                                           |       |      |   ✅   |         | `worker` pour l'application Coolify du worker (§ 6.1)                                                                                                                           |

Le worker reçoit **les mêmes variables que le back** : même image, même
validation au démarrage (`loadEnv`, rôle base restreint vérifié) ; les jetons
Blob lui servent pour le logo des PDF joints. Fonctionnement de la file
`alvm-email` (tentatives, rétention, historique des envois) :
`docs/file-emails.md`.

## 5. Staging — srv-innovia

Suit la convention du serveur (`/srv/staging/README.md` : bloc de 10 ports par
projet, seul le front lié à `127.0.0.1`, back/base/Redis jamais liés à l'hôte,
accès HTTPS par le tailnet via `tailscale serve`) ; écart assumé à « jamais
d'app sur srv-innovia » : `docs/adr/0001-monorepo-nestjs.md`. Dépôt :
`innovia-noumea/asso-saas`. Images **construites sur le serveur**, taguées au
SHA court (cible : images publiées par la CI sur ghcr.io, comme ppm-saas).
Aucune règle UFW : aucun port n'est ouvert.

```bash
ssh innovia-admin@192.168.0.252
free -h                                   # mémoire partagée avec l'inférence GPU
staging-ports alloc asso-saas && staging-ports list   # noter le port de base
git clone git@github.com:innovia-noumea/asso-saas.git /srv/dev/asso-saas && cd /srv/dev/asso-saas
cp deploy/staging/.env.example deploy/staging/.env && chmod 600 deploy/staging/.env
# remplir : BASE_PORT, IMAGE_TAG=$(git rev-parse --short HEAD), APP_URL=$(staging-ports url asso-saas),
#           secrets (openssl rand -hex 32 / -base64 32)
dc() { docker compose -f deploy/staging/compose.yml --env-file deploy/staging/.env "$@"; }

dc build                                  # asso-saas-front:<sha>, asso-saas-back:<sha>
dc up -d postgres redis                   # crée alvm_app (init-app-role.sh)
dc --profile ops run --rm migrate         # migrations + droits de alvm_app
read -r SUPER_ADMIN_EMAIL; read -rs SUPER_ADMIN_PASSWORD; export SUPER_ADMIN_EMAIL SUPER_ADMIN_PASSWORD
dc run --rm -e SUPER_ADMIN_EMAIL -e SUPER_ADMIN_PASSWORD back create-super-admin
dc up -d                                  # front, back, worker
curl -s "http://127.0.0.1:$BASE_PORT/api/health"
dc exec back node -e "fetch('http://127.0.0.1:4001/api/health?db=1').then(r=>r.text()).then(console.log)"
staging-ports expose asso-saas && staging-ports url asso-saas
```

L'ancien staging (image unique, PostgreSQL 17, volume `db-data`) n'est pas
repris : ce volume n'est plus monté ; le supprimer après vérification
(`docker volume rm asso-saas-staging_db-data`).

**Mise à jour** : `git pull`, `IMAGE_TAG` = nouveau SHA court dans le `.env`,
`dc build`, `dc --profile ops run --rm migrate` (sans effet s'il n'y a rien à
appliquer), `dc up -d`. **Retour arrière** : remettre l'ancien `IMAGE_TAG` (les
images précédentes restent en local) et `dc up -d` — voir § 6.5 pour les
migrations.

Recette : connexion super admin (`/auth/super-admin`), création d'une
association, connexion de son ADMIN (`/o/<espace>`), paramétrage, puis parcours
camp → inscription → facture → paiement → PDF → email.

## 6. Production — srv-ovh (Coolify v4)

### 6.1 Ressources Coolify

Une ressource par service, toutes dans le même projet/environnement Coolify
(réseau Docker `coolify`). Dépôt `innovia-noumea/asso-saas`, branche `master`,
auto-deploy par webhook GitHub App.

| Ressource       | Type                     | Réglages                                                                                                                                                                                  |
| --------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `alvm-postgres` | Database — PostgreSQL    | Image `postgres:16-alpine` ; utilisateur `alvm_owner`, base initiale `alvm` ; port public : **non** ; sauvegardes planifiées (§ 6.6)                                                      |
| `alvm-redis`    | Database — Redis         | Image `redis:7-alpine` ; mot de passe ; port public : **non** ; configuration : `appendonly yes`, `maxmemory-policy noeviction` (exigence BullMQ)                                         |
| `alvm-back`     | Application — Dockerfile | Base Directory `/`, Dockerfile `/alvm-back/Dockerfile`, Ports Exposes `4001`, **aucun domaine**, **Custom Docker Network Aliases : `alvm-back`**, health check `/api/health` port 4001    |
| `alvm-worker`   | Application — Dockerfile | Même Dockerfile que le back, variable `ALVM_PROCESS=worker`, Ports Exposes `4001` (rien n'écoute), **aucun domaine**, health check Coolify désactivé (le `HEALTHCHECK` de l'image suffit) |
| `alvm-front`    | Application — Dockerfile | Base Directory `/`, Dockerfile `/alvm-front/Dockerfile`, Ports Exposes `3000`, domaine `https://<domaine>`, health check `/api/health` port 3000                                          |

Pour chaque application : **Keep N images = 3** (retour arrière, § 6.5) et
**Watch Paths** (monorepo : sans eux, chaque push reconstruit tout) :

```
# alvm-back et alvm-worker
alvm-back/**
packages/shared/**
package.json
pnpm-workspace.yaml
pnpm-lock.yaml
.dockerignore

# alvm-front
alvm-front/**
packages/shared/src/**
packages/shared/package.json
package.json
pnpm-workspace.yaml
pnpm-lock.yaml
.dockerignore
```

DNS : enregistrement A Cloudflare → `51.68.127.157`, proxy actif, SSL **Full
(Strict)**. Aucune règle UFW nouvelle : seuls 80/443 (Traefik) sont publics,
aucun service de ce projet ne publie de port.

Hôtes des bases : le **nom du conteneur** Coolify (UUID), pas le nom affiché —
`sudo docker ps --format '{{.Names}}  {{.Image}}' | grep -e postgres -e redis`
(ou les « URL internes » de chaque base dans Coolify).

### 6.2 Variables par application

Saisies dans l'onglet _Environment Variables_ de chaque application (jamais
dans le dépôt), selon le tableau du § 4 :

- **alvm-back** et **alvm-worker** (mêmes valeurs, plus `ALVM_PROCESS=worker`
  pour le worker) : `DATABASE_URL` (rôle `alvm_app`), `AUTH_SECRET`,
  `INTERNAL_API_SECRET`, `AUTH_URL`, `PLATFORM_ENCRYPTION_KEY`, `REDIS_URL`,
  `EMAIL_FROM_ADDRESS`, `RESEND_API_KEY`, `BLOB_READ_WRITE_TOKEN`,
  `BLOB_PRIVATE_READ_WRITE_TOKEN`.
- **alvm-front** : `AUTH_SECRET`, `INTERNAL_API_SECRET` (identiques au back),
  `AUTH_URL`, `API_INTERNAL_URL=http://alvm-back:4001`, `TRUSTED_PROXY_HOPS=2`.
- `DATABASE_MIGRATION_URL` n'est posée **dans aucune application** : elle ne
  sert qu'au `migrate` joué à la main.

### 6.3 Premier déploiement

1. **Base** : créer `alvm-postgres`, puis le rôle applicatif, depuis un poste
   qui a le dépôt (le mot de passe ne passe ni par une ligne de commande ni par
   l'historique) :
   ```bash
   read -rs ALVM_APP_DB_PASSWORD      # openssl rand -hex 32, rangé dans le coffre
   { printf 'ALVM_APP_DB_PASSWORD=%s\n' "$ALVM_APP_DB_PASSWORD"; cat deploy/postgres/init-app-role.sh; } \
     | ssh ubuntu@51.68.127.157 "sudo docker exec -i <conteneur-postgres> sh -s"
   ```
2. **Redis** : créer `alvm-redis`.
3. **Applications** : créer `alvm-back`, `alvm-worker`, `alvm-front`, poser
   les variables (§ 6.2), déployer le back. Sur une base vide il démarre (sa
   sonde ne dépend pas du schéma) mais rien ne fonctionne encore.
4. **Migrations**, avec l'image du back tout juste construite :
   ```bash
   ssh ubuntu@51.68.127.157
   IMG=$(sudo docker inspect <conteneur-back> --format '{{.Config.Image}}')
   read -rs DATABASE_URL; read -rs DATABASE_MIGRATION_URL; export DATABASE_URL DATABASE_MIGRATION_URL
   sudo --preserve-env=DATABASE_URL,DATABASE_MIGRATION_URL \
     docker run --rm --network coolify -e DATABASE_URL -e DATABASE_MIGRATION_URL "$IMG" migrate
   ```
5. **Premier super administrateur** (rôle applicatif, pas le propriétaire) :
   ```bash
   read -r SUPER_ADMIN_EMAIL; read -rs SUPER_ADMIN_PASSWORD; export SUPER_ADMIN_EMAIL SUPER_ADMIN_PASSWORD
   sudo --preserve-env=DATABASE_URL,SUPER_ADMIN_EMAIL,SUPER_ADMIN_PASSWORD \
     docker run --rm --network coolify -e DATABASE_URL -e SUPER_ADMIN_EMAIL -e SUPER_ADMIN_PASSWORD "$IMG" create-super-admin
   ```
6. Déployer `alvm-worker` puis `alvm-front`. Vérifier
   `https://<domaine>/api/health`, la readiness du back
   (`sudo docker exec <conteneur-back> node -e "fetch('http://127.0.0.1:4001/api/health?db=1').then(r=>r.text()).then(console.log)"`)
   et le journal du worker (`[alvm-worker] prêt — file alvm-email`).
7. **Associations** : se connecter sur `https://<domaine>/auth/super-admin`, puis
   créer chaque association depuis l'accueil de la super administration (nom,
   identifiant d'espace, premier ADMIN) — `docs/super-admin.md`. L'ADMIN se
   connecte ensuite par `https://<domaine>/o/<espace>`.
8. **`TRUSTED_PROXY_HOPS`** : vérifier sur place que l'adresse retenue est celle
   du client, ni celle de Cloudflare ni celle de Traefik.
9. **Sauvegardes** planifiées dès la mise en service et une **restauration
   vérifiée** avant d'ouvrir aux familles (§ 6.6).

### 6.4 Mises à jour

- **Sans migration** : merge sur `master` → Coolify reconstruit les seules
  applications concernées (Watch Paths). Le back et le worker partagent le code :
  ils se déploient ensemble.
- **Avec migration** (nouveau dossier dans `packages/shared/prisma/migrations`) :
  aucune migration n'est jouée au démarrage. Écrire des migrations **compatibles
  avec la version en service** (ajouts d'abord ; suppressions et renommages dans
  une livraison suivante), puis :
  1. merge → Coolify déploie back et worker ;
  2. **aussitôt**, `migrate` avec la nouvelle image (commande du § 6.3, étape 4) ;
  3. vérifier `/api/health?db=1` et un parcours métier.
- **Fenêtre entre 1 et 2** : le nouveau code tourne sur l'ancien schéma ; les
  requêtes qui lisent une colonne nouvelle échouent pendant ces quelques
  secondes. Pour une migration lourde, prévoir une fenêtre de maintenance.

### 6.5 Retour arrière

Coolify → application → _Rollback_ vers l'image précédente (Keep N = 3), pour
**back, worker et front ensemble** si le contrat tRPC a changé. Les migrations
ne se défont pas : une migration compatible (§ 6.4) laisse tourner l'ancienne
version ; sinon, restaurer la sauvegarde précédant la migration (perte des
écritures intervenues depuis — décision à prendre explicitement).

### 6.6 Sauvegardes et restauration

- **PostgreSQL** : sauvegardes planifiées de `alvm-postgres` dans Coolify
  (quotidiennes, rétention 7 jours, copie hors du VPS — S3 ou srv-innovia
  `/mnt/backup/ovh/`). Dump ponctuel :
  `sudo docker exec <conteneur-postgres> pg_dump -U alvm_owner -d alvm -Fc > alvm-$(date +%F).dump`.
- **Restauration vérifiée** (avant l'ouverture, puis régulièrement) : restaurer
  sur une base jetable (`pg_restore --no-owner -d <base>`), jouer
  `init-app-role.sh` puis `migrate` (droits de `alvm_app`), démarrer un back
  dessus et se connecter. Une sauvegarde jamais restaurée n'est pas une
  sauvegarde.
- **Secrets hors du serveur** (coffre) : `PLATFORM_ENCRYPTION_KEY` (vital),
  `AUTH_SECRET` (perdu : sessions invalidées), `INTERNAL_API_SECRET`
  (régénérable), mots de passe PostgreSQL et Redis.
- **Redis** : file transitoire (AOF), aucune sauvegarde — les résultats d'envoi
  sont en base.
- **Snapshot OVH** : filet ultime (CLAUDE.md InnovIA § 9.1).

## 7. Réseau et ports

| Hôte        | Publié                                   | Interne uniquement                     | UFW                   |
| ----------- | ---------------------------------------- | -------------------------------------- | --------------------- |
| srv-ovh     | rien (Traefik sert 80/443 pour le front) | back 4001, PostgreSQL 5432, Redis 6379 | aucune règle nouvelle |
| srv-innovia | front sur `127.0.0.1:$BASE_PORT`         | back, PostgreSQL, Redis                | aucune règle nouvelle |

Dans les fichiers compose, deux réseaux : `app` (front, back, worker ; accès
sortant) et `data` (`internal: true` : back, worker, PostgreSQL, Redis ; ni
front ni Internet). Coolify place toutes ses ressources sur le réseau `coolify` :
cette séparation n'y existe pas, l'isolement repose sur l'absence de domaine et
de port publié, le secret interne et les mots de passe des bases.

Le relais du front borne les corps à 6 Mo et le back exige `content-length`
sur les requêtes avec corps (411/413) : rien à régler côté Traefik.

## 8. Répétition locale — vérifiée le 2026-09-27

Pile complète `compose.ovh.yml` (projet compose distinct, front publié sur
`127.0.0.1:3190` par un fichier de surcharge local), images construites depuis
les Dockerfile ci-dessus (legacy builder, sans BuildKit) :

| Vérification                                                                     | Résultat                                                                                |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `init-app-role.sh` (hook initdb, rejeu `docker exec … sh -s`, mot de passe vide) | rôle créé `alvm_app` f/f (super/bypassrls) ; rejeu idempotent ; refus sans mot de passe |
| `migrate` puis rejoué                                                            | 3 migrations appliquées + droits ; « No pending migrations »                            |
| `create-super-admin` puis rejoué                                                 | compte créé ; refus « Cette adresse possède déjà un compte »                            |
| `/api/health` front, back, `?db=1`                                               | 200, `database: ok`, `version` = tag ; conteneurs `healthy`                             |
| Connexion super admin (NextAuth, curl)                                           | 302 + cookie de session ; mauvais mot de passe → `CredentialsSignin`                    |
| Chemin HTTPS de prod (`AUTH_URL=https://…`, en-têtes `X-Forwarded-*`)            | cookie `__Secure-authjs.session-token` (Secure, HttpOnly) accepté par le back           |
| `organizations.create` via le relais tRPC                                        | association créée (200) ; sans session → 401                                            |
| Back appelé sans / avec un faux `x-internal-secret` (cookie valide)              | 403 « Accès réservé au front de la plateforme » ; témoin avec secret → 200              |
| Rôle de `DATABASE_URL` vu du back                                                | `alvm_app`, ni superuser ni BYPASSRLS ; 0 association visible sans contexte             |
| Back démarré avec le rôle propriétaire                                           | refus au démarrage (superuser / BYPASSRLS)                                              |
| Worker (`worker` et `ALVM_PROCESS=worker`)¹                                      | `prêt — file alvm-email`, sonde OK, arrêt SIGTERM immédiat                              |
| Isolement                                                                        | seul le front publié ; le front ne résout pas `alvm-postgres`                           |
| PID 1 / droits                                                                   | `node` en PID 1, utilisateur `node`, `/app` non inscriptible                            |

¹ Avec une image du back construite depuis ce Dockerfile et le worker
(`src/worker.ts`) alors en cours de développement sur une branche parallèle.

## 9. Pas encore vérifié

- Coolify réel : champ _Custom Docker Network Aliases_, `ALVM_PROCESS` sur
  l'application worker, Watch Paths, réglages Redis.
- Comportement derrière Cloudflare + Traefik (valeur de `TRUSTED_PROXY_HOPS`).
- Téléversement (jeton Blob) et envoi réel d'email (clé Resend).
- Publication des images par la CI (ghcr.io) : les images sont aujourd'hui
  construites sur chaque serveur.
