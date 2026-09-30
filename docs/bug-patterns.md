# Pièges récurrents du projet (bug patterns)

Fiches courtes, réutilisables. Chaque bug P0/P1 résolu ajoute une fiche
(CLAUDE.md InnovIA §6.6). Les pièges transverses aux projets InnovIA vivent dans
le skill `bug-patterns`.

## BP-01 — `create` Prisma + RLS : le `RETURNING` passe par la policy SELECT

- **Symptôme** : `new row violates row-level security policy for table "platform_audit_logs"`
  alors que la policy INSERT est `WITH CHECK (true)`.
- **Cause** : Prisma émet `INSERT … RETURNING *`. PostgreSQL impose alors à la
  ligne insérée les policies **SELECT** de la table. Le journal d'audit n'est
  lisible qu'en scope `platform` : toute écriture en scope `auth` ou `tenant`
  échouait.
- **Correctif** : écrire par `createMany` (pas de `RETURNING`), sans ouvrir la
  lecture du journal (`alvm-back/src/services/platform-audit.service.ts`).
- **Règle** : sur une table à policies asymétriques (écriture plus large que la
  lecture), jamais de `create` / `update` / `upsert` qui renvoie la ligne.
- **Détection** : invisible aux tests unitaires (Prisma simulé) ; vu au premier
  lancement réel. Couvert par `pnpm test:integration`.

## BP-02 — Middleware tRPC : `next()` ne lève pas

- **Symptôme** (évité à la conception) : une procédure en erreur dont la
  transaction de contexte est quand même validée (écritures partielles
  commitées).
- **Cause** : `await next()` renvoie `{ ok: false, error }` au lieu de lever.
- **Règle** : dans un middleware qui ouvre une transaction, convertir
  `!result.ok` en exception pour déclencher le rollback, puis rendre le
  résultat intact (`alvm-back/src/trpc/trpc.init.ts`, `ProcedureFailed`).

## BP-03 — Middleware tRPC qui « ré-élargit » le contexte

- **Symptôme** : 83 erreurs `'ctx.user' is possibly 'null'` après ajout d'un
  middleware.
- **Cause** : `next({ ctx: { ...ctx, x } })` dans un `t.middleware` générique
  recopie le type de base du contexte (`user: AuthUser | null`) par-dessus le
  type affiné par le middleware précédent.
- **Règle** : ne passer à `next({ ctx })` que les champs ajoutés ou modifiés.

## BP-04 — Verrou consultatif sur une clé NULL

- **Piège** : `pg_advisory_xact_lock(hashtextextended(NULL, 0))` ne verrouille
  rien (fonction STRICT → NULL) sans erreur.
- **Règle** : toute clé de verrou dérivée du contexte a une valeur de repli
  (`COALESCE(app_current_org_id()::text, 'platform')`, `lockTenant`).

## BP-05 — Unicité « par tenant » et `findUnique`

- **Piège** : après passage de `email @unique` à `@@unique([organizationId, email])`,
  un `findUnique({ where: { email } })` ne compile plus — et un contournement
  par `findFirst` sans RLS chercherait dans toutes les associations.
- **Règle** : sous RLS, `findFirst({ where: { email } })` est correct (la base
  limite au tenant) ; en scope `platform` ou `auth`, **toujours** préciser
  `organizationId` (`auth.service.ts`, `platform.ts`).

## BP-06 — `$transaction` imbriqué dans une transaction de contexte

- **Piège** : le client d'une transaction interactive Prisma n'a pas de
  `$transaction` ; les services existants en ouvrent pourtant.
- **Règle** : passer par le client de `withDbContext`, dont `$transaction`
  exécute la fonction (ou le tableau de requêtes) dans la transaction courante.
  Ne jamais appeler `withDbContext` depuis un code déjà dans une transaction
  (deux connexions → interblocage possible sur un verrou).

## BP-07 — Contexte RLS au niveau session

- **Piège** : `SET app.org_id = …` (ou `set_config(…, false)`) persiste sur la
  connexion et fuit vers la requête suivante qui la réutilise dans le pool.
- **Règle** : uniquement `set_config(…, true)` à l'intérieur d'une transaction.

## BP-08 — `prisma generate` dans un monorepo pnpm

- **Symptôme** : `Command failed: pnpm add prisma@x -D` au `postinstall`.
- **Cause** : le client est cherché depuis le dossier du **schéma**
  (`packages/shared/prisma`), pas depuis le paquet qui lance la commande.
- **Règle** : `@alvm/shared` porte `prisma` et `@prisma/client` (même version que
  le back) et génère le client ; les autres paquets ne lancent pas `generate`.
