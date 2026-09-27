#!/bin/sh
# Rôle applicatif ALVM : créé (ou remis en conformité) dans la base de l'application.
#
# Deux rôles (docs/deploiement-ovh.md § Base de données) :
#   $POSTGRES_USER — propriétaire du schéma : `migrate` uniquement (DATABASE_MIGRATION_URL)
#   alvm_app       — rôle applicatif NOSUPERUSER NOBYPASSRLS : la RLS s'applique
#                    à chaque requête du back et du worker (DATABASE_URL)
# Les droits sur les tables sont posés par `migrate` après chaque migration, pas
# ici : les tables n'existent pas encore.
#
# Usages :
#   - hook d'initialisation de l'image postgres (compose.ovh.yml, staging) :
#     monté dans /docker-entrypoint-initdb.d/, joué une seule fois, à la
#     création du volume ;
#   - base déjà créée (PostgreSQL géré par Coolify) : idempotent, et rejouable
#     pour changer le mot de passe — procédure dans docs/deploiement-ovh.md § 6.3 ;
#   - CI : base d'intégration (.github/workflows/ci.yml).
#
# Variables : ALVM_APP_DB_PASSWORD (requis), ALVM_APP_DB_ROLE (défaut alvm_app),
# POSTGRES_USER / POSTGRES_DB (posées par l'image postgres). Le mot de passe
# passe par l'environnement (`\getenv`, psql 15+) : jamais sur une ligne de
# commande ni dans un fichier.
#
# Pas de `set -eu` : l'image postgres SOURCE ce fichier s'il n'est pas
# exécutable, et ces options fuiraient dans son propre script.

if [ -z "${ALVM_APP_DB_PASSWORD:-}" ]; then
  echo "[init-app-role] ALVM_APP_DB_PASSWORD absent : rôle applicatif non créé." >&2
  exit 1
fi

export ALVM_APP_DB_PASSWORD

psql -v ON_ERROR_STOP=1 \
  --username "${POSTGRES_USER:-postgres}" \
  --dbname "${POSTGRES_DB:-${POSTGRES_USER:-postgres}}" \
  -v app_role="${ALVM_APP_DB_ROLE:-alvm_app}" <<'SQL' || exit 1
\getenv app_password ALVM_APP_DB_PASSWORD
SELECT NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_role') AS create_role \gset
\if :create_role
CREATE ROLE :"app_role" LOGIN;
\endif
-- Remis en conformité à chaque passage : aucun privilège qui contournerait la RLS.
ALTER ROLE :"app_role" WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION
  PASSWORD :'app_password';
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'app_role') \gexec
SQL

echo "[init-app-role] Rôle applicatif prêt."
