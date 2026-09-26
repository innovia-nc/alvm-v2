#!/bin/sh
# Point d'entrée de l'image srv-ovh (Coolify).
#
# Pas de migration automatique : le schéma évolue par SQL manuel répété sur un
# clone (prisma/migrations-manual/, docs/deploiement.md). Le projet n'a pas
# d'historique `prisma/migrations` — `migrate deploy` répondrait P3005, et
# `db push --accept-data-loss` au démarrage est exclu sur une base comptable.
set -e

case "${1:-serve}" in
  serve)
    exec node server.js
    ;;
  *)
    exec "$@"
    ;;
esac
