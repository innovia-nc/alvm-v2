# ADR 0002 — SaaS multi-tenant : une association = un tenant, isolé par la RLS PostgreSQL

- **Statut** : accepté — 2026-09-27
- **Contexte de décision** : refonte « asso-saas » (plusieurs associations sur une même plateforme)
- **Règles InnovIA** : CLAUDE.md §5.8 (RLS par défaut sur tout projet multi-tenant), §5.13, §6.5

## Contexte

L'application était une installation pour UNE entreprise (ALVM). La super
administration ajoutée le 2026-09-26 séparait les rôles, mais le document
`super-admin.md` le disait lui-même : « cette séparation de rôles ne crée pas une
architecture multientreprise ». Un projet frère (`ppm-saas`) isole ses tenants
par filtrage applicatif seul ; son CLAUDE.md reconnaît que « chaque `where` sans
`tenantId` est une fuite potentielle, que rien en aval n'arrête ». Les directives
InnovIA interdisent ce choix pour des données sensibles (fiches enfants, données
médicales, comptabilité) : l'isolation doit tenir **en base**.

## Décision

### Modèle
- `organizations` : `kind` = `TENANT` (association) ou `PLATFORM` (un seul espace,
  celui des `SUPER_ADMIN`), `status` = `ACTIVE` | `SUSPENDED`, `slug` = identifiant
  public saisi à la connexion (`[a-z0-9-]`, 3–40, contrainte CHECK).
- `organization_id NOT NULL` sur les 23 tables métier + `document_counters` +
  `email_messages`. Valeur par défaut : `app_current_org_id()` — le code métier
  n'écrit jamais le tenant à la main, la base le déduit du contexte.
- Unicités **par tenant** : email du compte, email du personnel, nom de type
  d'ACM, code de moyen de paiement, numéros de facture / paiement / remboursement,
  réglages `(category, key)`. Deux associations peuvent avoir chacune
  `FAC-2026-0001`, et une famille peut avoir un compte (même email) dans deux
  associations sans que l'une apprenne l'existence de l'autre.
- Numérotation : `document_counters (organization_id, kind)` incrémenté par
  `INSERT … ON CONFLICT DO UPDATE … RETURNING` dans la transaction — pas de
  séquence globale, pas de trou si la transaction échoue, sérialisation par
  tenant par le verrou de ligne.

### Contexte transactionnel
Deux GUC **transactionnelles** (`set_config(…, true)`, jamais au niveau session :
une connexion du pool ne transporte jamais le contexte d'une requête à l'autre) :

| GUC | Valeurs | Lue par |
|-----|---------|---------|
| `app.scope` | `tenant` · `platform` · `auth` | `app_current_scope()` |
| `app.org_id` | uuid | `app_current_org_id()` |

`withDbContext(context, fn)` (`alvm-back/src/db-context.ts`) ouvre la transaction,
pose les GUC et passe à `fn` un client dont `$transaction` est « aplati » (les
services existants ouvrent des sous-transactions qui s'exécutent dans celle du
contexte). Toute procédure tRPC authentifiée s'exécute ainsi dans **une**
transaction du tenant de la session ; une procédure en erreur l'annule
(`next()` de tRPC ne lève pas : le middleware convertit `{ ok: false }` en
exception pour déclencher le rollback).

### Policies (ENABLE + FORCE sur chaque table)
- Tables métier : `organization_id = app_current_org_id()` en lecture ET en
  écriture (WITH CHECK). Sans contexte : aucune ligne (fail-closed).
- `users` : son tenant, plus les scopes `auth` (connexion : le compte est cherché
  avant que la session n'existe) et `platform` (super administration).
- `accounts`, `sessions`, `verification_tokens` : visibles si et seulement si le
  compte l'est (sous-requête elle-même soumise à la RLS).
- `organizations` : un tenant ne voit que la sienne ; seule la plateforme écrit.
- `platform_audit_logs` : ajout seul (aucune policy UPDATE/DELETE), lecture
  plateforme. `platform_settings` / `platform_integrations` : lecture libre
  (identité de l'application, clé d'envoi chiffrée), écriture plateforme.
- `login_attempts` : hors RLS (empreintes SHA-256 sans donnée de tenant).
- Trigger : un `SUPER_ADMIN` vit dans l'espace `PLATFORM`, et seulement lui.

### Rôles PostgreSQL
- **Propriétaire** (`DATABASE_MIGRATION_URL`) : applique les migrations.
- **Applicatif** (`DATABASE_URL`) : `NOSUPERUSER NOBYPASSRLS`, droits DML seuls,
  posés par `pnpm db:migrate` qui **refuse** un rôle applicatif privilégié. Le
  back et le worker vérifient au démarrage (`assertRestrictedDatabaseRole`) et
  refusent de démarrer en production sinon.
- Aucun rôle `BYPASSRLS` n'existe dans l'application. La super administration
  n'a pas de passe-droit sur les données métier : pour provisionner une
  association, sa transaction `platform` bascule explicitement `app.org_id` sur
  le nouveau tenant (`actAsOrganization`) et la RLS vérifie chaque ligne écrite.

### Défense en profondeur côté application
- Le SQL « unsafe » (`$queryRawUnsafe`, `$executeRawUnsafe`) est interdit par
  ESLint dans le back : du SQL concaténé pourrait réécrire le contexte RLS.
- Verrous consultatifs par tenant (`lockTenant`) : deux associations ne se
  sérialisent jamais entre elles.
- Fichiers rangés sous `organizations/<uuid>/…` dans le stockage ; l'URL du logo
  est refusée si elle ne pointe pas dans le préfixe de l'association.

## Conséquences

- **Base neuve** : l'historique de migrations Prisma repart de zéro
  (`packages/shared/prisma/migrations`) ; les SQL manuels et `db push` sont
  supprimés. Il n'y avait pas encore de production en service (décision Vercel →
  auto-hébergement du 2026-09-27, « aucune reprise de données Neon »).
- Chaque requête authentifiée coûte une transaction (BEGIN / `set_config` /
  COMMIT) : négligeable au regard de la latence réseau.
- `create` Prisma = `INSERT … RETURNING` : la ligne insérée doit aussi passer la
  policy **SELECT**. D'où l'écriture du journal d'audit par `createMany`
  (docs/bug-patterns.md, BP-01).
- Les tests unitaires (Prisma simulé) ne voient pas la RLS : la suite
  `pnpm test:integration` (PostgreSQL réel, rôle non-superuser) est obligatoire
  avant tout push touchant les données (CLAUDE.md §6.5).
- Pas de clés étrangères composites `(organization_id, id)` : une référence
  vers une ligne d'un autre tenant n'est pas refusée par la base elle-même (les
  contrôles de clés étrangères ignorent la RLS). Les routeurs lisent la ligne
  référencée (invisible hors tenant → NOT_FOUND) avant d'écrire ; la lecture
  jointe d'une telle ligne serait de toute façon filtrée. Renforcement suivi en
  dette (TD-028).

## Alternatives écartées

- **Filtrage applicatif seul** (modèle `ppm-saas`) : un oubli = une fuite ;
  contraire à §5.8 pour des données d'enfants.
- **Un schéma ou une base par tenant** : migrations × N, pool de connexions × N,
  super administration transverse compliquée ; disproportionné pour des
  associations de quelques centaines de familles.
- **Tenant dans l'URL (`/[slug]/…`)** : réécriture de tous les écrans et liens.
  Le tenant vient de la session ; l'URL `/o/<espace>` sert seulement de lien
  d'accès (connexion préremplie).
- **Email unique globalement** : révélerait à une association qu'une adresse
  existe chez une autre (« email déjà utilisé ») — fuite inter-tenants.
