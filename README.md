# Asso SaaS

Plateforme SaaS de gestion de camps de vacances et d'accueils de loisirs pour
associations — familles, enfants, inscriptions, présences, facturation,
paiements, avoirs, export FEC. Chaque association est un espace isolé (Row
Level Security PostgreSQL).

```
packages/shared   schéma Prisma + migrations, code partagé (@alvm/shared)
alvm-back         API NestJS 11 + tRPC, worker d'emails BullMQ (@alvm/back)
alvm-front        application Next.js 15 (@alvm/front)
```

## Démarrer

```bash
docker compose up -d        # PostgreSQL 16 + Redis 7
pnpm install
pnpm db:migrate && pnpm db:seed
pnpm dev                    # back :4001, front (next dev)
```

Détails, comptes de démonstration et commandes de test :
[`docs/developpement-local.md`](docs/developpement-local.md).

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — services, flux, code, rôles
- [`docs/adr/`](docs/adr/) — décisions d'architecture (monorepo NestJS, multi-tenant RLS, file d'emails)
- [`docs/deploiement-ovh.md`](docs/deploiement-ovh.md) — staging srv-innovia, production srv-ovh
- [`CLAUDE.md`](CLAUDE.md) — index du projet et règles non négociables
