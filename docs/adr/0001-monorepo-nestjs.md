# ADR 0001 — Monorepo pnpm : front Next.js, back NestJS, paquet partagé

- **Statut** : accepté — 2026-09-27 (remplace l'architecture « monolithe Next.js sur Vercel »)
- **Règles InnovIA** : CLAUDE.md §4 (stack), §5.2 à §5.6 (structure), §5.4 (communication), §12

## Contexte

La refonte de 2026 avait fusionné l'ancien couple NestJS + Next.js en un
monolithe Next.js, avec une seule justification : le déploiement serverless
Vercel + Neon. Cette plateforme a été abandonnée le 2026-09-27 au profit de
l'auto-hébergement (staging srv-innovia, production srv-ovh / Coolify), c'est-à-
dire exactement la cible des directives InnovIA : un conteneur par service.
Le monolithe était par ailleurs hors norme sur des points non négociables :
pas de `pnpm-workspace.yaml` ni de `packages/shared/`, schéma Prisma et code
serveur importés directement par les écrans, pas de NestJS.

## Décision

```
alvm-v2/
  pnpm-workspace.yaml   package.json (lint:all, typecheck:all, test:all, build:all)
  compose.yml           PostgreSQL 16 (_dev/_test) + Redis 7 pour le dev local
  packages/shared/      @alvm/shared — schéma Prisma + migrations (SOURCE UNIQUE),
                        code isomorphe (modules, identité, slug, mots de passe,
                        safeUrlSchema / escapeHtml, contrat HTTP interne)
  alvm-back/            @alvm/back — NestJS 11, tRPC, services, PDF, stockage, worker
  alvm-front/           @alvm/front — Next.js 15 (App Router), NextAuth, écrans
```

### Back (NestJS 11)
- `TrpcController` monte `/api/trpc/*` via `fetchRequestHandler` (§5.3) ;
  `trpc/trpc.init.ts`, `trpc.router.ts` (exporte le type `AppRouter` :
  `import type { AppRouter } from '@alvm/back/trpc'`), `trpc.context.ts`,
  `trpc/routers/<domaine>.ts`.
- Contrôleurs REST pour ce que tRPC ne transporte pas : documents, PDF générés,
  téléversements multipart, santé, authentification interne. Leur logique vit
  dans des handlers Fetch (`src/http/*.handler.ts`) sans dépendance au framework.
- `bodyParser` désactivé : les corps sont transmis en flux (tRPC, `formData()`).
- Configuration validée par Zod au démarrage, fail-closed (`src/config/env.ts`).
- Build tsup (bundle CJS, dépendances npm externes, `@alvm/shared` embarqué).
  Pas d'injection par métadonnées de décorateurs (contrôleurs sans dépendances),
  donc pas de `emitDecoratorMetadata` : `tsx` suffit en développement.

### Front (Next.js 15)
- Ne touche jamais la base (§5.4). Le navigateur ne connaît qu'une origine :
  `/api/{trpc,documents,generate,upload}` sont relayés vers le back
  (`app/api/[...path]/route.ts`) ; `/api/auth/*` reste NextAuth.
- NextAuth vérifie les identifiants et la validité des sessions via
  `/api/internal/auth/*` du back ; les Server Components appellent le back en
  HTTP (`lib/trpc/server.ts`) ; `superjson` des deux côtés.
- Environnement validé par `@t3-oss/env-nextjs` au démarrage (`instrumentation.ts`).

### Confiance front ↔ back
- Le back n'a pas de domaine public (réseau Docker / alias Coolify). Toute
  requête (sauf `/api/health`) doit porter `x-internal-secret`
  (`INTERNAL_API_SECRET`, comparaison à temps constant).
- La session reste un cookie httpOnly chiffré par Auth.js (`AUTH_SECRET`
  partagé) : le relais le transmet, le back le déchiffre (`@auth/core/jwt`) et
  **revalide la session en base à chaque requête** (compte actif, version de
  session, rôle, association active).
- L'adresse du client (limitation de débit) est calculée par le front, qui
  connaît les relais de confiance (`TRUSTED_PROXY_HOPS`), et transmise dans
  `x-alvm-client-ip` ; le back ne la lit que si le secret interne est valide.
  Les en-têtes internes envoyés par un navigateur sont écrasés par le relais.

## Écarts assumés aux directives

| Directive | Écart | Justification |
|-----------|-------|---------------|
| §5.3 « token Bearer via headers » | Cookie de session httpOnly relayé par le front | Un Bearer lisible par le JavaScript du navigateur serait exfiltrable par XSS ; même origine, pas de CORS, `SameSite=Lax` |
| §5.5 `modules/{domain}/*.service.ts` injectés | Services = fonctions TypeScript (`src/services`) | Hérités et testés (1 000+ tests) ; les routeurs tRPC les appellent avec le client de la transaction RLS, ce qui rend l'injection Nest superflue |
| §4 Tailwind v4 (skill) | Tailwind 3.4 conservé | Migration visuelle hors périmètre de la refonte SaaS |
| §4 PostgreSQL 16 | PostgreSQL 16 (le staging de la veille était en 17) | Aligné sur la directive |

## Conséquences

- Deux images (front, back) + un processus worker (même image que le back).
- Le front type-checke les fichiers du back qu'il atteint par `AppRouter`
  (alias `@back/*` déclaré dans les deux tsconfig) : une rupture de contrat tRPC
  casse le `tsc` du front.
- Chaque requête métier du navigateur fait un saut supplémentaire (front → back
  sur le réseau Docker) : négligeable ; Traefik pourra router `/api/trpc`
  directement vers le back si besoin.
