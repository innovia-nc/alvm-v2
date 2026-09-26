#!/bin/sh
# Point d'entrée de l'image ALVM (staging srv-innovia, prod srv-ovh).
#
# Pas de migration automatique au démarrage : les migrations sont un geste
# explicite, avant de servir le code qui en dépend.
#
# Commandes one-shot :
#   migrate                 prisma migrate deploy + droits du rôle applicatif
#                           (DATABASE_MIGRATION_URL = propriétaire, DATABASE_URL = rôle applicatif)
#   create-super-admin      espace de plateforme + premier SUPER_ADMIN
#                           (SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD)
set -e

case "${1:-serve}" in
  serve)
    exec node server.js
    ;;
  migrate)
    exec node scripts/db-migrate.js
    ;;
  create-super-admin)
    exec node scripts/create-super-admin.js
    ;;
  *)
    exec "$@"
    ;;
esac
