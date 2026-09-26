#!/bin/sh
# Point d'entrée de l'image ALVM (staging srv-innovia, prod srv-ovh).
#
# Pas de migration automatique au démarrage : le schéma d'une base en service
# évolue par SQL manuel répété sur un clone (prisma/migrations-manual/). Le
# projet n'a pas d'historique `prisma/migrations` — `migrate deploy` répondrait
# P3005, et `db push --accept-data-loss` au démarrage est exclu sur une base
# comptable.
#
# Commandes one-shot (base neuve) :
#   db-init                 schéma + invariants SQL + réglages pricing (refuse une base non vide)
#   seed-payment-methods    moyens de paiement système (idempotent)
#   create-super-admin      requiert SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD
set -e

case "${1:-serve}" in
  serve)
    exec node server.js
    ;;
  db-init)
    exec node scripts/db-init.js
    ;;
  seed-payment-methods)
    exec node scripts/seed-payment-methods.js
    ;;
  create-super-admin)
    exec node scripts/create-super-admin.js
    ;;
  *)
    exec "$@"
    ;;
esac
