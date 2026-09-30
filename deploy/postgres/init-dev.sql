-- Initialisation du PostgreSQL de DÉVELOPPEMENT (compose.yml), exécutée une
-- seule fois à la création du volume.
--
-- Deux rôles, comme en production :
--   postgres  — propriétaire du schéma, applique les migrations (DATABASE_MIGRATION_URL)
--   alvm_app  — rôle applicatif SANS privilège : la RLS s'applique (DATABASE_URL)
--
-- Les droits de alvm_app sur les tables sont posés après chaque migration par
-- `pnpm db:migrate` (scripts/db-migrate.ts), pas ici : les tables n'existent pas encore.
CREATE ROLE alvm_app LOGIN PASSWORD 'alvm_app' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
CREATE DATABASE alvm_dev;
CREATE DATABASE alvm_test;
GRANT CONNECT ON DATABASE alvm_dev TO alvm_app;
GRANT CONNECT ON DATABASE alvm_test TO alvm_app;
