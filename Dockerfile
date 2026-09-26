# Image de production ALVM — srv-ovh (Coolify v4, build pack « Dockerfile »).
# Vercel n'utilise pas ce fichier. Voir docs/deploiement-ovh.md.

# ── Stage 1 : dépendances ────────────────────────────────
FROM node:22-alpine AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
# --prod=false : Coolify injecte NODE_ENV=production, pnpm sauterait prisma/typescript.
# --ignore-scripts : le postinstall (prisma generate) n'a pas encore le schéma.
RUN pnpm install --frozen-lockfile --prod=false --ignore-scripts

# ── Stage 2 : build ──────────────────────────────────────
FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_OUTPUT=standalone \
    NEXT_TELEMETRY_DISABLED=1 \
    CHECKPOINT_DISABLE=1
RUN pnpm exec prisma generate && pnpm exec next build

# ── Stage 3 : runtime ────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    NEXT_TELEMETRY_DISABLED=1 \
    CHECKPOINT_DISABLE=1 \
    HOME=/tmp
# Pas de TZ : Alpine n'embarque pas tzdata, le conteneur reste en UTC.

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY docker-entrypoint.sh ./
RUN chmod 0755 docker-entrypoint.sh

USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["serve"]
