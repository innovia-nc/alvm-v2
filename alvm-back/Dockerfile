# Image du BACK ALVM (NestJS 11) : API, worker d'emails et commandes d'exploitation.
# Une image, trois processus (docker-entrypoint.sh) :
#   serve (défaut)       API HTTP sur :4001 (tRPC, documents, téléversements)
#   worker               consommateur BullMQ de la file d'emails
#   migrate              prisma migrate deploy + droits du rôle applicatif
#   create-super-admin   espace de plateforme + premier SUPER_ADMIN
#
# Contexte de build = RACINE du monorepo :
#   docker build -f alvm-back/Dockerfile -t asso-saas-back:$(git rev-parse --short HEAD) .
# Déploiement : docs/deploiement-ovh.md.
#
# Pas de syntaxe réservée à BuildKit (cache mounts, COPY --chmod) : l'image se
# construit avec n'importe quel client Docker, Coolify compris.

# ── Base : Node 22 + pnpm (version figée par `packageManager`) ──────────────
FROM node:22-alpine AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1
RUN corepack enable
WORKDIR /repo

# ── Magasin pnpm : ne dépend que du lockfile (couche mise en cache) ─────────
FROM base AS fetch
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch

# ── Build : bundles tsup + dépendances de production isolées ────────────────
FROM fetch AS build
COPY . .
# --prod=false : un NODE_ENV=production injecté par la plateforme de build ne
# doit pas priver le build de tsup/prisma (devDependencies).
RUN pnpm install --offline --frozen-lockfile --prod=false --filter "@alvm/back..."
# dist/main.js, dist/worker.js, dist/scripts/*.js (@alvm/shared embarqué).
RUN pnpm --filter @alvm/back build
# Dépendances de PRODUCTION seules, sans lien vers le reste du monorepo.
# --prefer-offline (et non --offline) : `deploy` relit les métadonnées du
# registre pour @alvm/shared. --ignore-scripts : le postinstall de @alvm/shared
# (prisma generate) n'a ni CLI ni schéma ici ; le client est généré juste
# après, pour ce node_modules.
RUN pnpm --filter @alvm/back deploy --prod --prefer-offline --ignore-scripts /out \
 && cp -R packages/shared/prisma /out/prisma \
 && pnpm --filter @alvm/back exec prisma generate --schema /out/prisma/schema.prisma \
 && node -p "require('/out/node_modules/@prisma/client/package.json').version" > /out/prisma-version

# ── Runtime ────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
# Pas de TZ : Alpine n'embarque pas tzdata, le conteneur reste en UTC.
ENV NODE_ENV=production \
    PORT=4001 \
    HOME=/tmp \
    NODE_OPTIONS=--enable-source-maps \
    CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1 \
    PRISMA_SCHEMA=/app/prisma/schema.prisma

# CLI Prisma pour `migrate`, à la version EXACTE du client généré (lue dans le
# lockfile via le build) : la couche reste en cache tant que la version ne bouge pas.
COPY --from=build /out/prisma-version /tmp/prisma-version
RUN npm install -g "prisma@$(cat /tmp/prisma-version)" \
 && npm cache clean --force \
 && rm -rf /tmp/prisma-version /tmp/.npm

# Fichiers applicatifs en lecture seule pour l'utilisateur d'exécution (root
# propriétaire) : seul /tmp est inscriptible.
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/alvm-back/dist ./dist
# Schéma + migrations (source unique : packages/shared/prisma).
COPY --from=build /out/prisma ./prisma
COPY alvm-back/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod 0755 docker-entrypoint.sh

USER node
EXPOSE 4001
# Liveness : /api/health pour l'API ; le worker n'écoute aucun port (voir l'entrypoint).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD ["/app/docker-entrypoint.sh", "healthcheck"]
ENTRYPOINT ["/app/docker-entrypoint.sh"]
