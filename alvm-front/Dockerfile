# Image du FRONT ALVM (Next.js 15, sortie standalone) : écrans, NextAuth, relais
# /api/{trpc,documents,generate,upload} vers le back. Aucun accès à la base.
#
# Contexte de build = RACINE du monorepo :
#   docker build -f alvm-front/Dockerfile -t asso-saas-front:$(git rev-parse --short HEAD) .
# Déploiement : docs/deploiement-ovh.md.
#
# Pas de syntaxe réservée à BuildKit (cache mounts, COPY --chmod) : l'image se
# construit avec n'importe quel client Docker, Coolify compris.

# ── Base : Node 22 + pnpm (version figée par `packageManager`) ──────────────
FROM node:22-alpine AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1 \
    CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1
RUN corepack enable
WORKDIR /repo

# ── Magasin pnpm : ne dépend que du lockfile (couche mise en cache) ─────────
FROM base AS fetch
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch

# ── Build ───────────────────────────────────────────────────────────────────
FROM fetch AS build
COPY . .
# Le front type-checke les sources du back (type AppRouter) : ses dépendances
# de développement, @alvm/back compris, sont installées pour le build.
# --prod=false : un NODE_ENV=production injecté par la plateforme de build ne
# doit pas priver le build de typescript/eslint.
RUN pnpm install --offline --frozen-lockfile --prod=false --filter "@alvm/front..."
# SKIP_ENV_VALIDATION au build SEULEMENT : les pages sont dynamiques, les
# secrets ne sont lus qu'à l'exécution (validés au démarrage, instrumentation.ts).
RUN NEXT_OUTPUT=standalone SKIP_ENV_VALIDATION=1 pnpm --filter @alvm/front build

# ── Runtime ────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
# Pas de TZ : Alpine n'embarque pas tzdata, le conteneur reste en UTC.
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    HOME=/tmp \
    NEXT_TELEMETRY_DISABLED=1

# `outputFileTracingRoot` = racine du monorepo : le standalone reproduit
# l'arborescence du dépôt, le serveur est alvm-front/server.js.
# Fichiers en lecture seule pour l'utilisateur d'exécution (root propriétaire),
# hormis le cache de Next.
COPY --from=build /repo/alvm-front/.next/standalone ./
COPY --from=build /repo/alvm-front/.next/static ./alvm-front/.next/static
RUN mkdir -p alvm-front/.next/cache && chown node:node alvm-front/.next/cache

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health', { signal: AbortSignal.timeout(4000) }).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "alvm-front/server.js"]
