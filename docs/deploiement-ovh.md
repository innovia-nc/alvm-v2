# Déploiement — staging puis srv-ovh (Coolify)

> Créé le 2026-09-27. Complète `docs/deploiement.md` (topologie Vercel + Neon,
> toujours valable pour la prod actuelle). Procédure Coolify générale : skill
> `srv-ovh`.

## Ce qui part

La branche `improve/ui-ux-2026-09-26` embarque, par rapport à `master` :
correctifs d'audit (2026-09-22), refonte UI/UX, **super administration**
(rôle `SUPER_ADMIN`, intégrations chiffrées, branding) et l'outillage Docker.
Le schéma de base change : **les migrations SQL ci-dessous doivent être
appliquées avant que le nouveau code ne serve du trafic**, sur chaque base.

## 1. Migrations SQL — ordre imposé

Répété le 2026-09-27 sur une copie de la base d'audit (état pré-migrations) :
les cinq fichiers passent, dans cet ordre, sans erreur.

```bash
for f in 2026-09-22-00-schema 2026-09-22-account-access \
         2026-09-22-business-invariants 2026-09-26-super-admin 2026-09-26-platform; do
  psql "$URL_DIRECTE" -v ON_ERROR_STOP=1 -f prisma/migrations-manual/$f.sql || break
done
```

- `00-schema` **d'abord** : il ajoute des colonnes sans `IF NOT EXISTS` ; les
  deux suivants sont idempotents et le rejouent sans dommage, l'inverse échoue.
- Les trois premiers portent leur propre `BEGIN/COMMIT` — ne pas ajouter `-1`.
- `super-admin` (`ALTER TYPE … ADD VALUE`) est hors transaction.
- Diff résiduel attendu après application (`prisma migrate diff --from-url …
--to-schema-datamodel prisma/schema.prisma`) : **uniquement** le
  `DROP CONSTRAINT refunds_credit_note_id_fkey` et le `DROP INDEX
login_attempts_window_start_idx` — objets posés volontairement par le SQL,
  que Prisma ne modélise pas. **Ne pas appliquer ce diff.**
- Toujours : `pg_dump` de sauvegarde avant, et répétition sur clone
  (procédure `docs/deploiement.md` § Migrations).

## 2. Variables d'environnement

| Variable                        | Staging   | srv-ovh | Note                                                                                                                                     |
| ------------------------------- | --------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_SECRET`                   | ✅        | ✅      | `openssl rand -base64 32`, **distinct** par environnement                                                                                |
| `AUTH_URL`                      | ✅        | ✅      | URL publique sans slash final — liens de réinitialisation de mot de passe                                                                |
| `POSTGRES_PRISMA_URL`           | ✅        | ✅      | srv-ovh : `postgresql://<user>:<mdp>@<conteneur-postgres>:5432/<db>` (nom du **conteneur** Docker, pas le nom Coolify)                   |
| `POSTGRES_URL_NON_POOLING`      | ✅        | ✅      | srv-ovh : même valeur que ci-dessus (pas de pgbouncer)                                                                                   |
| `PLATFORM_ENCRYPTION_KEY`       | ✅        | ✅      | **Nouveau.** `openssl rand -base64 32`. À conserver : la perdre rend illisibles les clés API saisies dans la super administration        |
| `BLOB_READ_WRITE_TOKEN`         | ✅        | ✅      | Vercel Blob fonctionne hors Vercel par jeton. Surchargeable depuis la super administration                                               |
| `BLOB_PRIVATE_READ_WRITE_TOKEN` | ✅        | ✅      | Store privé (documents, PDF)                                                                                                             |
| `RESEND_API_KEY`                | optionnel | ✅      | Absente : envoi désactivé et expliqué à l'écran                                                                                          |
| `TRUSTED_PROXY_HOPS`            | —         | ✅      | **Contrôle de sécurité.** Cloudflare proxy + Traefik : `2`. Absent : toutes les connexions partagent un quota de 100 tentatives / 15 min |

Staging et srv-ovh : **bases et stores Blob distincts de la prod** — un staging
branché sur le store de prod supprimerait de vrais documents (TD-006).

## 3. Staging

Objectif : valider le code et les migrations sur une copie des données réelles
avant la bascule srv-ovh.

1. Clone de prod : `pg_dump --no-owner --no-acl --exclude-schema=neon_auth` de
   Neon → base de staging (branche Neon, ou Postgres 17 Coolify `alvm-staging-db`).
2. Appliquer les migrations (§ 1), puis `pnpm db:seed:payment-methods`
   (idempotent).
3. Déployer la branche :
   - **Vercel** : `vercel deploy` (preview) — ⚠️ les previews échouaient en une
     seconde au 2026-08-19, diagnostic préalable dans `docs/deploiement.md`
     § « Échecs de déploiement en preview » ;
   - **ou Coolify** : application `alvm-staging` construite depuis la branche,
     mêmes réglages qu'au § 4, domaine de staging.
4. Créer le super administrateur (§ 5), se connecter, configurer les
   intégrations et le branding.
5. `pnpm smoke` et `pnpm recette` contre le staging **uniquement s'il est
   jetable** (les deux campagnes écrivent).

## 4. srv-ovh (Coolify v4)

L'image se construit depuis le `Dockerfile` à la racine (build validé en
local le 2026-09-27 avec le builder Docker historique, sans BuildKit).

| Réglage Coolify     | Valeur                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Base                | PostgreSQL **17** (`postgres:17-alpine`) — la prod Neon est en 17, un dump 17 ne se restaure pas en 16. Port public : non |
| Application         | GitHub `innovia-nc/alvm-v2`, branche `master` (après merge), build pack **Dockerfile**                                    |
| Port                | `3000`                                                                                                                    |
| Health check        | `GET /api/health` (liveness, sans base). Readiness : `/api/health?db=1` (503 si la base est KO)                           |
| Stockage persistant | aucun — les fichiers sont dans Vercel Blob                                                                                |
| Domaine             | `https://<domaine>` dans Coolify, enregistrement A Cloudflare → `51.68.127.157`, proxy actif, SSL Full (Strict)           |
| Rétention           | Keep N images = 3                                                                                                         |
| Sauvegardes         | planifiées dans Coolify dès la mise en service ; **restauration vérifiée** avant d'ouvrir                                 |

Bascule depuis Neon :

1. Geler les écritures (prévenir les utilisateurs), `pg_dump` final Neon
   (`--no-owner --no-acl --exclude-schema=neon_auth`).
2. Restaurer dans le Postgres Coolify (`sudo docker exec -i <conteneur> psql …`).
   Les triggers legacy (« dernier parent », `payment_status`, TD-005) viennent
   avec le dump — une base recréée par `db push` ne les aurait pas.
3. Appliquer les migrations (§ 1) si la prod Neon ne les a pas déjà reçues.
4. Déployer, vérifier `/api/health?db=1`, connexion ADMIN, une facture PDF.
5. Basculer le DNS, puis mettre à jour `AUTH_URL`.
6. Garder Neon en lecture seule quelques jours, comme retour arrière.

Vérifier `TRUSTED_PROXY_HOPS` sur place plutôt que de le déduire : l'IP lue
doit être celle du client, pas celle de Cloudflare ni de Traefik.

## 5. Premier super administrateur

Le script `pnpm db:create-super-admin` (tsx) n'est pas dans l'image. Le lancer
depuis un poste de dev, à travers un tunnel SSH vers la base :

```bash
# IP du conteneur Postgres sur le réseau coolify
ssh ubuntu@51.68.127.157 "sudo docker inspect <conteneur> --format '{{(index .NetworkSettings.Networks \"coolify\").IPAddress}}'"
ssh -N -L 5439:<ip-conteneur>:5432 ubuntu@51.68.127.157 &

export POSTGRES_PRISMA_URL=postgresql://<user>:<mdp>@127.0.0.1:5439/<db>
export POSTGRES_URL_NON_POOLING=$POSTGRES_PRISMA_URL
SUPER_ADMIN_EMAIL=… SUPER_ADMIN_PASSWORD=… pnpm db:create-super-admin
pnpm db:seed:payment-methods   # base neuve seulement — idempotent
```

Adresse dédiée : le script refuse de promouvoir un compte existant.

## 6. Vérifié en local le 2026-09-27

Image construite puis lancée contre la base répétée (§ 1) : `next-server` en
PID 1, `/api/health` et `/api/health?db=1` à 200, connexion réelle SUPER_ADMIN
(`/auth/super-admin`) et ADMIN, `platform.configuration` via tRPC, tableau de
bord et liste des factures à 200, PDF de facture et fiche enfant générés dans
le conteneur. Non vérifié : téléversement (nécessite un jeton Blob),
envoi d'email, comportement derrière Traefik/Cloudflare.
