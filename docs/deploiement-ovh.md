# Déploiement — staging srv-innovia, prod srv-ovh

> Créé le 2026-09-27. **Remplace Vercel + Neon** (décision du 2026-09-27) :
> l'application est auto-hébergée, avec une **base neuve** — aucune reprise
> de données Neon. `docs/deploiement.md` décrit l'ancienne topologie.

| Environnement | Hôte                          | Orchestration                                 | Accès                        |
| ------------- | ----------------------------- | --------------------------------------------- | ---------------------------- |
| Staging       | srv-innovia (`192.168.0.252`) | Docker Compose — `deploy/staging/compose.yml` | LAN / WireGuard uniquement   |
| Production    | srv-ovh (`51.68.127.157`)     | Coolify v4 — `Dockerfile`                     | Public, Cloudflare → Traefik |

Les deux exécutent **la même image** (`Dockerfile` à la racine).

## 1. L'image

| Commande               | Effet                                                                                                                                                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `serve` (défaut)       | `exec node server.js` — **aucune** migration au démarrage                                                                                                                                                                                                           |
| `db-init`              | Base **neuve** : `prisma db push` + invariants SQL (trigger de statut de paiement, séquences de numérotation, index partiel d'inscription, CHECK code postal) + réglages `pricing` (TGC = 0, exonération LP 492). **Refuse une base qui contient déjà des tables.** |
| `seed-payment-methods` | Les 6 moyens de paiement système — idempotent, obligatoire (sans `CREDIT_NOTE`, la validation d'une facture d'un client avec avoir est refusée)                                                                                                                     |
| `create-super-admin`   | Premier compte `SUPER_ADMIN` — requiert `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` (12+ caractères, majuscule, minuscule, chiffre)                                                                                                                                 |

Sonde : `GET /api/health` (liveness, utilisée par le `HEALTHCHECK`) ;
`/api/health?db=1` ajoute un `SELECT 1` (503 si la base est KO).

**Évolutions de schéma ensuite** : `db-init` ne sert qu'une fois. Une base en
service évolue par SQL relu et répété sur clone, archivé dans
`prisma/migrations-manual/` et appliqué avec `psql -v ON_ERROR_STOP=1` avant
de déployer le code qui en dépend.

Vérifié le 2026-09-27 sur un Postgres 17 vierge : les trois commandes
passent, `db-init` rejoué est refusé, l'application démarre et la connexion
super admin fonctionne.

Hors dépôt, donc **absent d'une base neuve** : le trigger legacy « dernier
parent d'un enfant » (TD-005). `parents.delete` fait la vérification lui-même
avant toute écriture ; seule une écriture SQL directe pourrait laisser un
enfant sans parent.

## 2. Variables d'environnement

| Variable                                                 | Requise           | Note                                                                                                                                                                                                                  |
| -------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POSTGRES_PRISMA_URL`                                    | ✅                | `postgresql://<user>:<mdp>@<hôte>:5432/<db>`                                                                                                                                                                          |
| `POSTGRES_URL_NON_POOLING`                               | ✅                | même valeur (pas de pgbouncer)                                                                                                                                                                                        |
| `AUTH_SECRET`                                            | ✅                | `openssl rand -base64 32`, **distinct** par environnement                                                                                                                                                             |
| `AUTH_URL`                                               | ✅                | URL publique sans slash final — liens de réinitialisation de mot de passe                                                                                                                                             |
| `PLATFORM_ENCRYPTION_KEY`                                | ✅                | `openssl rand -base64 32`. **À sauvegarder** : la perdre rend illisibles les clés API saisies dans la super administration                                                                                            |
| `TRUSTED_PROXY_HOPS`                                     | prod              | **Contrôle de sécurité.** Cloudflare proxy + Traefik : `2` ; staging derrière `tailscale serve` : `1`. Mal réglé, un appelant choisit son IP et contourne la limitation des connexions                                |
| `BLOB_READ_WRITE_TOKEN`, `BLOB_PRIVATE_READ_WRITE_TOKEN` | pour les fichiers | Le stockage reste **Vercel Blob** (API par jeton, fonctionne hors Vercel). Sans jeton : pas de logo ni de documents téléversés. Surchargeables depuis la super administration. Stores **distincts** par environnement |
| `RESEND_API_KEY`                                         | pour l'email      | Absente : envoi désactivé et expliqué à l'écran                                                                                                                                                                       |

## 3. Staging — srv-innovia

Suit la convention du serveur (`/srv/staging/README.md` : bloc de 10 ports
par projet, app liée à `127.0.0.1`, base jamais liée à l'hôte, accès HTTPS
par le tailnet via `tailscale serve`). Dépôt : `innovia-noumea/asso-saas` (créé le 2026-09-27 depuis
`innovia-nc/alvm-v2`, pour bénéficier des runners de srv-innovia). Écart
provisoire : l'image est **construite sur le serveur**, taguée au SHA court,
en attendant un workflow qui la publie sur GHCR comme ppm-saas. `dc` abrège
`docker compose -f deploy/staging/compose.yml --env-file deploy/staging/.env`.

Premier déploiement :

```bash
ssh innovia-admin@192.168.0.252
free -h                                   # mémoire partagée avec l'inférence GPU
staging-ports alloc asso-saas && staging-ports list   # noter le port de base
git clone git@github.com:innovia-noumea/asso-saas.git /srv/dev/asso-saas && cd /srv/dev/asso-saas
cp deploy/staging/.env.example deploy/staging/.env && chmod 600 deploy/staging/.env
# remplir : BASE_PORT, IMAGE_TAG=$(git rev-parse --short HEAD),
#           APP_URL=$(staging-ports url asso-saas), secrets (openssl rand -base64 32)
alias dc='docker compose -f deploy/staging/compose.yml --env-file deploy/staging/.env'

dc build app
dc up -d db
dc run --rm app db-init
dc run --rm app seed-payment-methods
dc run --rm -e SUPER_ADMIN_EMAIL=… -e SUPER_ADMIN_PASSWORD=… app create-super-admin
dc up -d app
curl -s "http://127.0.0.1:$BASE_PORT/api/health?db=1"
staging-ports expose asso-saas && staging-ports url asso-saas
```

Mise à jour : `git pull`, `IMAGE_TAG` = nouveau SHA court dans le `.env`,
appliquer tout nouveau fichier de `prisma/migrations-manual/`
(`dc exec -T db psql -U alvm -d alvm_staging -v ON_ERROR_STOP=1 < prisma/migrations-manual/<f>.sql`),
puis `dc up -d --build app`. Retour arrière : remettre l'ancien `IMAGE_TAG`
(l'image précédente reste en local) et `dc up -d app`.

Recette : connexion super admin (`/auth/super-admin`), création d'un ADMIN,
paramétrage (organisation, branding, intégrations), puis parcours camp →
inscription → facture → paiement → PDF.

## 4. Production — srv-ovh (Coolify v4)

| Réglage Coolify     | Valeur                                                                                                               |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Base                | PostgreSQL 17 (`postgres:17-alpine`), port public : **non**                                                          |
| Application         | GitHub `innovia-noumea/asso-saas`, branche `master`, build pack **Dockerfile**, port `3000`                          |
| Health check        | `/api/health`                                                                                                        |
| Stockage persistant | aucun (fichiers dans Vercel Blob)                                                                                    |
| Hôte de la base     | **nom du conteneur** Docker, pas le nom Coolify : `sudo docker ps --format '{{.Names}} {{.Image}}' \| grep postgres` |
| Domaine             | `https://<domaine>` dans Coolify ; A Cloudflare → `51.68.127.157`, proxy actif, SSL Full (Strict)                    |
| Rétention           | Keep N images = 3                                                                                                    |

Premier déploiement :

1. Créer la base, puis l'application ; poser les variables.
2. Déployer (build). Sur une base vide l'application répond, mais personne ne
   peut se connecter — sans risque.
3. Initialiser depuis le VPS, avec l'image tout juste construite :
   ```bash
   ssh ubuntu@51.68.127.157
   IMG=$(sudo docker inspect <conteneur-app> --format '{{.Config.Image}}')
   E="-e POSTGRES_PRISMA_URL=… -e POSTGRES_URL_NON_POOLING=…"
   sudo docker run --rm --network coolify $E $IMG db-init
   sudo docker run --rm --network coolify $E $IMG seed-payment-methods
   sudo docker run --rm --network coolify $E -e SUPER_ADMIN_EMAIL=… -e SUPER_ADMIN_PASSWORD=… $IMG create-super-admin
   ```
4. Vérifier `https://<domaine>/api/health?db=1`, se connecter en super admin.
5. Vérifier `TRUSTED_PROXY_HOPS` sur place : l'IP retenue doit être celle du
   client, ni celle de Cloudflare ni celle de Traefik.
6. **Sauvegardes** PostgreSQL planifiées dans Coolify dès la mise en service,
   et une restauration vérifiée avant d'ouvrir aux familles. Sauvegarder aussi
   `PLATFORM_ENCRYPTION_KEY` hors du serveur.

## 5. Pas encore vérifié

Téléversement (jeton Blob requis), envoi d'email (clé Resend), comportement
réel derrière Cloudflare + Traefik.
