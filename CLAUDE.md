# CLAUDE.md — Asso SaaS (ALVM)

> Index du projet (CLAUDE.md InnovIA §5.14) : il renvoie vers les documents de
> `docs/`, qui portent le détail. Les règles globales InnovIA (CLAUDE.md de
> l'espace de travail, dépôt `claude-config`) s'appliquent en plus.

## Présentation

Plateforme **SaaS multi-tenant** de gestion de camps de vacances et d'accueils
de loisirs pour associations (familles, enfants, inscriptions, présences,
facturation, paiements, avoirs, export FEC). Chaque association est un tenant
isolé par la **Row Level Security** PostgreSQL. ALVM est la première
association cliente.

- **Pattern IA : aucun** (pas d'inférence ; ni pattern A ni B).
- **Monorepo pnpm** : `packages/shared` (@alvm/shared : schéma Prisma +
  migrations, code isomorphe), `alvm-back` (@alvm/back : NestJS 11 + tRPC 11,
  worker BullMQ), `alvm-front` (@alvm/front : Next.js 15 App Router, NextAuth v5).
- **Stack** : Node 22, pnpm 9, TypeScript 5 strict, Prisma 6, PostgreSQL 16,
  Redis 7 / BullMQ 5, Zod 4, shadcn/ui + Tailwind 3.4, Vitest 2, Playwright.
  Écarts aux directives justifiés dans `docs/adr/0001-monorepo-nestjs.md`.
- **Déploiement** : staging srv-innovia (Docker Compose), production srv-ovh
  (Coolify) — `docs/deploiement-ovh.md`.

## Documents

| Document | Contenu |
|----------|---------|
| `docs/architecture.md` | services, flux, emplacement du code, rôles, migrations |
| `docs/adr/0001-monorepo-nestjs.md` | monorepo front/back/shared, NestJS, confiance front ↔ back, écarts assumés |
| `docs/adr/0002-multi-tenant-rls.md` | modèle multi-tenant, contexte transactionnel, policies RLS, rôles PostgreSQL |
| `docs/adr/0003-file-emails-bullmq.md` | décision : emails par file BullMQ `alvm-email` et worker |
| `docs/file-emails.md` | file d'emails : producteur, worker, statuts, rétention, commandes de vérification |
| `docs/conventions-metier.md` | comptabilité (TGC, avoirs, FEC), PDF, fichiers, emails, statuts, soft-delete, invariants |
| `docs/developpement-local.md` | poste de dev : compose, seed, comptes de démo, commandes de test |
| `docs/deploiement-ovh.md` | déploiement de référence (images, variables, premier déploiement, mises à jour) |
| `docs/super-admin.md` | super administration : associations, modules, intégrations, audit |
| `docs/dette-technique.md` | registre de dette priorisé (P0–P3, OPEN / PARTIEL / DONE) |
| `docs/bug-patterns.md` | pièges récurrents (RLS + RETURNING, middlewares tRPC, verrous…) |
| `docs/retros.md` | rétrospectives et post-mortems (historisé, on ajoute) |
| `docs/test-evidence/` | preuves de recette visuelle (Playwright, captures par critère) |
| `docs/stories/BACKLOG.md` | backlog produit |
| `CHANGELOG.md` | journal des livraisons |

## Règles non négociables (détail dans les documents cités)

- **Toute donnée métier passe par un contexte RLS** : procédure tRPC authentifiée
  (transaction du tenant de la session) ou `withDbContext()` ; jamais le client
  Prisma racine pour des données métier (ADR 0002).
- **Nouvelle table métier** = `organization_id` (défaut `app_current_org_id()`)
  + policy RLS ENABLE/FORCE **dans la même migration** ; unicités par tenant.
- **Pas de SQL « unsafe »** (`$queryRawUnsafe` / `$executeRawUnsafe` interdits par
  ESLint) ; contexte RLS uniquement via `set_config(…, true)` (bug-patterns BP-07).
- **Table à policies asymétriques** : pas de `create`/`update` qui renvoie la
  ligne (`RETURNING` soumis à la policy SELECT — BP-01).
- **Le front ne touche jamais la base** : tRPC / relais `/api/*` vers le back.
- **Comptabilité** : ne jamais coder le taux de TGC (0 par défaut, exonération
  LP 492) ; une imputation d'avoir passe par un `Payment` `CREDIT_NOTE` ; les
  deux vues du solde d'un avoir restent cohérentes (conventions-metier.md).
- **Statuts affichés** via `<StatusBadge />` ; **PDF** : réserver la place du
  pied de page ; **fichiers** : préfixe `organizations/<uuid>/`, ligne puis blob.
- **Tests** : `pnpm test:all` (lint + tsc + unitaires) et `pnpm test:integration`
  (PostgreSQL réel, rôle non-superuser) verts avant tout push ; E2E Playwright
  pour tout parcours touché.

## Tests

- Unitaires : `alvm-back/test/unit/*.spec.ts` (Prisma simulé :
  `test/helpers/mock-prisma.ts`, caller tRPC : `test/helpers/test-caller.ts`
  dont `withDb` simule la transaction RLS), `alvm-front/test/unit/*` (composants ;
  docblock `// @vitest-environment jsdom`), `packages/shared/test/*`.
- Intégration : `alvm-back/test/integration/*.integration.spec.ts` (base
  `alvm_integration`, RLS réelle) — `pnpm test:integration`.
- E2E : `alvm-front/tests/e2e/*.e2e.spec.ts` — `pnpm e2e`.
