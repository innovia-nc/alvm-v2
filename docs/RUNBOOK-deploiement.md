# Runbook déploiement — migrations BDD à appliquer

> Les changements de **schéma** Prisma ne sont **pas** appliqués
> automatiquement par le build Vercel (`build = prisma generate && next build`,
> pas de `db push` / `migrate deploy`). Toute nouvelle colonne/table doit être
> synchronisée **manuellement** sur Supabase après merge, sinon les requêtes
> Prisma échouent en prod (erreur `The column ... does not exist`).

## ⛔ Migration EN ATTENTE — FEAT-004 (traçabilité factures)

**Symptôme observé en prod (retour déploiement)** :
création de facture → **HTTP 500** :

```
Invalid `prisma.invoice.create()` invocation:
The column `created_by_id` does not exist in the current database.
```

**Cause** : FEAT-004 a ajouté `Invoice.createdById` / `validatedById`
(`prisma/schema.prisma`), mais les colonnes `created_by_id` /
`validated_by_id` n'ont **jamais été créées** sur la base Supabase. Prisma
sélectionne toutes les colonnes mappées lors du `RETURNING` d'un `create()`,
d'où le 500 sur **toute** création de facture.

> Note : ce n'est **pas** un bug applicatif. Le code est correct ; il manque
> uniquement l'application de la migration sur la base.

### Correctif — à exécuter sur Supabase (prod)

Deux options, **idempotentes** (colonnes optionnelles, aucune perte de données,
aucun backfill) :

**Option 1 — Prisma (recommandé, synchronise tout le schéma)**

```bash
# POSTGRES_URL_NON_POOLING doit pointer la base PROD (port 5432, direct)
pnpm prisma db push
# équivalent : pnpm db:push
```

**Option 2 — SQL direct** (SQL Editor Supabase ou `psql`), via le fichier de
référence `prisma/migrations-manual/FEAT-004-tracabilite-invoice.sql` :

```sql
ALTER TABLE "invoices"
  ADD COLUMN IF NOT EXISTS "created_by_id"   UUID REFERENCES "users"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "validated_by_id" UUID REFERENCES "users"("id") ON DELETE SET NULL;
```

### Vérification post-application

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'invoices'
  AND column_name IN ('created_by_id', 'validated_by_id');
-- doit retourner 2 lignes
```

Puis re-tester la génération d'une facture depuis l'IHM (le 500 disparaît).

> 💾 Snapshot Supabase recommandé avant toute application en prod (même si la
> migration est additive et idempotente).

## Procédure générale (futures migrations)

1. Merge de la story (schéma Prisma modifié + SQL de référence dans
   `prisma/migrations-manual/`).
2. **Avant/juste après le déploiement Vercel** : appliquer le schéma sur
   Supabase via `pnpm prisma db push` (ou le SQL `migrations-manual`).
   **JAMAIS `prisma migrate dev`** sur Supabase prod (cf. CLAUDE.md).
3. Vérifier en base que les colonnes/tables existent.
4. Test fonctionnel de la fonctionnalité concernée.
