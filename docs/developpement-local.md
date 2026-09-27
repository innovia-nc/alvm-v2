# Développement local

Poste principal : MacBook Air (CLAUDE.md InnovIA §3.3). Tout est testé en local
avant push.

## Démarrage

```bash
docker compose up -d                 # PostgreSQL 16 (127.0.0.1:5436) + Redis 7 (127.0.0.1:6380)
pnpm install                         # génère aussi le client Prisma (@alvm/shared)
cp .env.example alvm-back/.env.local      # puis renseigner les secrets (voir ci-dessous)
cp .env.example alvm-front/.env.local     # AUTH_SECRET / INTERNAL_API_SECRET identiques au back
pnpm db:migrate                      # migrations + droits du rôle applicatif alvm_app
pnpm db:seed                         # démo : espaces « alvm » et « asso-demo », super admin
pnpm dev                             # back :4001 + front (next dev)
```

`compose.yml` crée deux rôles, comme en production : `postgres` (propriétaire,
`DATABASE_MIGRATION_URL`) et `alvm_app` (NOSUPERUSER NOBYPASSRLS, `DATABASE_URL`) —
la RLS s'applique donc en développement exactement comme en production.

Secrets locaux : `openssl rand -base64 32` (AUTH_SECRET, PLATFORM_ENCRYPTION_KEY),
`openssl rand -hex 32` (INTERNAL_API_SECRET). Le front a besoin de
`API_INTERNAL_URL=http://localhost:4001`.

## Comptes de démonstration (`pnpm db:seed`)

Mot de passe de tous les comptes : `Test1234!Seed` (ou `SEED_PASSWORD`).

| Portail | Espace | Compte |
|---------|--------|--------|
| `/auth/super-admin` | — | `superadmin@plateforme.test` |
| `/o/alvm` | `alvm` | `admin@alvm.test`, `sophie.martin@alvm.test` (personnel), `martin.dupont@familles.test` (parent) |
| `/o/asso-demo` | `asso-demo` | `admin@asso-demo.test`, `martin.dupont@familles.test` (autre compte, même email) |

## Tests

| Commande | Portée |
|----------|--------|
| `pnpm test:all` | lint + tsc + tests unitaires des trois paquets (à lancer avant tout push) |
| `pnpm test:integration` | PostgreSQL réel (base `alvm_integration`, rôle non-superuser) : isolation RLS, flux métier, routes HTTP — **échoue** si PostgreSQL est absent |
| `pnpm e2e` | parcours navigateur Playwright (front + back démarrés) |
| `pnpm build:all` | build tsup du back, `next build` du front |

## Nouvelle migration

```bash
pnpm db:migrate:dev --name <nom>     # rôle propriétaire (DATABASE_MIGRATION_URL)
```

Relire le SQL généré. Toute nouvelle table métier : `organization_id` +
policy RLS dans la même migration (voir `docs/architecture.md` § Migrations).
