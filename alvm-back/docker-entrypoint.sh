#!/bin/sh
# Point d'entrée de l'image back ALVM (staging srv-innovia, prod srv-ovh).
#
# Processus longs :
#   serve (défaut)       API NestJS (dist/main.js) sur $PORT (4001)
#   worker               consommateur de la file d'emails (dist/worker.js)
# Commandes one-shot :
#   migrate              prisma migrate deploy + droits du rôle applicatif
#                        (DATABASE_MIGRATION_URL = propriétaire, DATABASE_URL = rôle applicatif)
#   create-super-admin   espace de plateforme + premier SUPER_ADMIN
#                        (SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD, rôle applicatif)
# Interne :
#   healthcheck          sonde Docker (HEALTHCHECK de l'image)
#
# Sans argument, le processus est choisi par ALVM_PROCESS (défaut : serve) : une
# plateforme qui ne sait pas surcharger la commande d'une image (application
# Coolify « Dockerfile ») lance le worker avec ALVM_PROCESS=worker.
#
# Pas de migration automatique au démarrage : migrer est un geste explicite,
# joué avec le rôle propriétaire, que l'API n'a pas.
set -e

command="${1:-${ALVM_PROCESS:-serve}}"
[ "$#" -gt 0 ] && shift

case "$command" in
  serve)
    exec node dist/main.js
    ;;
  worker)
    if [ ! -f dist/worker.js ]; then
      echo "[entrypoint] dist/worker.js absent : cette image ne contient pas le worker." >&2
      exit 1
    fi
    exec node dist/worker.js
    ;;
  migrate)
    exec node dist/scripts/db-migrate.js
    ;;
  create-super-admin)
    exec node dist/scripts/create-super-admin.js
    ;;
  healthcheck)
    # Le worker n'écoute aucun port : il est vivant tant que son processus
    # tourne (s'il s'arrête, le conteneur s'arrête et la politique `restart`
    # le relance). Sinon : liveness HTTP de l'API, sans dépendance à la base.
    if pgrep -f 'node dist/worker\.js' > /dev/null 2>&1; then
      exit 0
    fi
    exec node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4001) + '/api/health', { signal: AbortSignal.timeout(4000) }).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
    ;;
  *)
    exec "$command" "$@"
    ;;
esac
