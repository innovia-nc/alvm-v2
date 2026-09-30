# Architecture — Asso SaaS (ALVM)

Plateforme SaaS de gestion de camps de vacances et d'accueils de loisirs pour
associations : familles, enfants, inscriptions, présences, facturation,
paiements, avoirs, export FEC. Chaque association est un **tenant** isolé.

**Pattern IA : aucun** — le produit n'utilise pas d'IA (ni A ni B, CLAUDE.md §5.1).

## Services

```
Navigateur ──HTTPS──▶ alvm-front (Next.js 15, public)
                        │  /api/auth/*                  NextAuth (cookie de session chiffré)
                        │  /api/{trpc,documents,generate,upload}/*  ─┐ relais (même origine)
                        │  Server Components ─── tRPC HTTP ───────────┤
                        │  NextAuth authorize / jwt ── /api/internal/auth/* ─┤
                        ▼                                               ▼
                     (réseau interne Docker, en-tête x-internal-secret)
                                                 alvm-back (NestJS 11, non public)
                                                   │  tRPC + REST, transaction RLS par requête
                                                   │  enqueue ─────▶ Redis 7 ◀──── alvm-worker (même image)
                                                   ▼                                  │ Resend (emails)
                                          PostgreSQL 16 (RLS, rôle alvm_app) ◀────────┘
                                          Vercel Blob (fichiers, préfixe par tenant)
```

| Service | Paquet | Rôle | Exposition |
|---------|--------|------|------------|
| front | `alvm-front` | écrans, NextAuth, relais API | public (Traefik / Cloudflare) |
| back | `alvm-back` (`dist/main.js`) | tRPC, documents, PDF, téléversements, auth interne | réseau interne uniquement |
| worker | `alvm-back` (`dist/worker.js`) | file `alvm-email` (BullMQ) | aucune |
| PostgreSQL 16 | — | données, RLS | jamais exposé |
| Redis 7 | — | files BullMQ | jamais exposé |

## Code

| Emplacement | Contenu |
|-------------|---------|
| `packages/shared/prisma/` | `schema.prisma` + `migrations/` — source de vérité unique |
| `packages/shared/src/` | code isomorphe : modules (`features`), identité (`platform`), `organization-slug`, mots de passe, `validation/` (`safeUrlSchema`, `escapeHtml`), contrat HTTP interne |
| `alvm-back/src/trpc/` | `trpc.init.ts` (procédures, transaction RLS), `trpc.router.ts` (compose, exporte `AppRouter`), `trpc.context.ts`, `routers/<domaine>.ts` |
| `alvm-back/src/services/` | logique métier (comptabilité, avoirs, factures, auth, organisations…) |
| `alvm-back/src/http/` | handlers Fetch des routes REST (documents, PDF, téléversements, santé) |
| `alvm-back/src/modules/` | contrôleurs NestJS (adaptateurs Express ↔ Fetch) |
| `alvm-back/src/db.ts`, `db-context.ts` | client Prisma, `withDbContext`, `lockTenant`, `actAsOrganization` |
| `alvm-back/src/pdf/`, `storage/` | documents @react-pdf, stockage Vercel Blob |
| `alvm-back/scripts/` | `db-migrate`, `create-super-admin`, `seed` (démo) |
| `alvm-front/app/` | App Router : `auth/`, `dashboard/{admin,staff,parent,super-admin}`, `o/[slug]`, `api/` |
| `alvm-front/lib/` | NextAuth (`auth/`), client tRPC (`trpc/`), accès au back (`api/back.ts`), `env.ts` |

## Isolation des tenants

Voir **ADR 0002**. Résumé : `organization_id` sur chaque table métier, policies
RLS ENABLE + FORCE, contexte posé par transaction (`app.scope`, `app.org_id`),
rôle applicatif sans privilège, aucune donnée visible sans contexte. Tests :
`pnpm test:integration` (PostgreSQL réel).

## Authentification

- Portail association : identifiant d'espace + email + mot de passe
  (`/auth/signin`, lien d'accès `/o/<espace>`). Portail plateforme :
  `/auth/super-admin`.
- Session JWT NextAuth (cookie httpOnly) ; le back la déchiffre et la revalide
  en base à chaque requête (compte actif, `sessionVersion`, rôle, association
  active). Suspendre une association révoque ses sessions immédiatement.
- Limitation de débit par (espace, email) et par adresse client
  (`login_attempts`, fenêtres de 15 minutes).

## Rôles

| Rôle | Espace | Accès |
|------|--------|-------|
| `SUPER_ADMIN` | plateforme | associations (création, suspension, modules), comptes, intégrations, identité, audit — **aucune donnée métier** |
| `ADMIN` | association | tout le métier de son association + paramètres |
| `STAFF` | association | gestion courante (camps, familles, inscriptions, présences, facturation) |
| `PARENT` | association | ses enfants, inscriptions, factures |

## Migrations

`pnpm db:migrate:dev` génère une migration (rôle propriétaire) ; la relire
(§12 « Migration Prisma sans relecture ») : Prisma ignore les index partiels,
CHECK, triggers et policies, qui vivent dans des migrations SQL écrites à la
main (`*_business_invariants`, `*_row_level_security`) — toute nouvelle table
métier doit recevoir `organization_id` ET sa policy dans la même migration.
`pnpm db:migrate` applique (`prisma migrate deploy`) puis pose les droits du
rôle applicatif.

## Documents liés

- `docs/adr/0001-monorepo-nestjs.md`, `docs/adr/0002-multi-tenant-rls.md`, `docs/adr/0003-file-emails-bullmq.md`
- `docs/deploiement-ovh.md` — déploiement (staging srv-innovia, production srv-ovh)
- `docs/developpement-local.md` — poste de développement
- `docs/conventions-metier.md` — règles comptables, PDF, fichiers, emails
- `docs/bug-patterns.md` — pièges récurrents
