-- =============================================================================
-- FEAT-004 — Traçabilité des factures : createdBy / validatedBy
-- =============================================================================
-- Appliqué via : prisma db push (Supabase) ou prisma migrate deploy
-- JAMAIS via prisma migrate dev (interdit sur Supabase prod — cf. CLAUDE.md)
--
-- Réversibilité : section DOWN commentée ci-dessous.
-- Prérequis UP : table "invoices" et table "users" existent.
-- Prérequis DOWN : aucune FK externe ne référence ces colonnes.
--
-- Sécurité : onDelete: SetNull — la suppression d'un utilisateur positionne
-- la FK à NULL sans toucher à la facture. Les factures existantes conservent
-- NULL dans les deux colonnes (pas de backfill requis, rétro-compat R1).
-- =============================================================================

-- ============================================================
-- UP — Appliquer la migration
-- ============================================================

ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "created_by_id"   UUID REFERENCES "users"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "validated_by_id" UUID REFERENCES "users"("id") ON DELETE SET NULL;

-- Les deux colonnes sont nullable : aucun backfill nécessaire.
-- Les factures existantes auront created_by_id = NULL et validated_by_id = NULL.

-- Commentaire sur l'absence d'index :
-- Les FK de traçabilité utilisateur ne font pas l'objet de filtres de liste
-- dans ce projet (pattern constant : Camp.created_by, Payment.recorded_by,
-- AccountingEntry.created_by/cancelled_by, etc. — aucun index dédié).
-- Ces colonnes sont lues ponctuellement en JOIN sur une facture déjà identifiée
-- par son PK. Un index B-tree serait sur-indexage à ce stade ; à réévaluer si
-- une vue "factures créées par moi" ou "factures à valider" est introduite.

-- ============================================================
-- DOWN — Revenir en arrière (exécuter si rollback nécessaire)
-- ============================================================

-- ATTENTION : supprimer les contraintes FK avant de dropper les colonnes.
-- Les noms de contrainte ci-dessous sont générés par PostgreSQL 16 ;
-- vérifier avec \d invoices ou pg_constraint si besoin.

-- ALTER TABLE "invoices"
--   DROP CONSTRAINT IF EXISTS "invoices_created_by_id_fkey",
--   DROP CONSTRAINT IF EXISTS "invoices_validated_by_id_fkey";

-- ALTER TABLE "invoices"
--   DROP COLUMN IF EXISTS "created_by_id",
--   DROP COLUMN IF EXISTS "validated_by_id";
