#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Banc de recette E2E ISOLÉ (Playwright) — CLAUDE.md InnovIA §6.5 / §6.6.
#
#   scripts/e2e-stack.sh up        # base alvm_e2e + migrations + seed, back :4102, front :3102
#   scripts/e2e-stack.sh test [..] # lance la recette Playwright contre le banc (args transmis)
#   scripts/e2e-stack.sh probe     # curl : le back refuse toute requête sans secret interne (SEC-01)
#   scripts/e2e-stack.sh restart   # rebâtit et relance back + front (après une modification du code)
#   scripts/e2e-stack.sh down      # arrête back et front (la base est CONSERVÉE)
#   scripts/e2e-stack.sh reset     # supprime puis recrée la base alvm_e2e (banc arrêté)
#   scripts/e2e-stack.sh status
#
# Ne touche ni à alvm_dev ni aux serveurs de développement (:4001 / :3000 / :3100) :
# base, ports, secrets et journaux sont propres au banc. PostgreSQL et Redis sont
# ceux du `compose.yml` (docker compose up -d). Le back tourne en mode
# production (comme l'image : pas de pile d'appels dans les erreurs tRPC) ; sa
# file d'emails vit dans une base Redis DÉDIÉE (index 14) et aucun worker ne la
# consomme : la recette ne teste pas l'envoi réel.
#
# Variables (toutes optionnelles) :
#   E2E_DB_NAME       base de recette              (défaut alvm_e2e)
#   E2E_DB_PORT       port PostgreSQL publié       (défaut 5436, cf. ALVM_DB_PORT)
#   E2E_BACK_PORT     port du back                 (défaut 4102)
#   E2E_FRONT_PORT    port du front                (défaut 3102)
#   E2E_FRONT_MODE    build (next build + start) | dev (next dev)   (défaut build)
#   E2E_STATE_DIR     secrets, pid, journaux       (défaut $TMPDIR/alvm-e2e)
#   E2E_REDIS_URL     file d'emails du back        (défaut redis://127.0.0.1:6380/14)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_NAME="${E2E_DB_NAME:-alvm_e2e}"
DB_PORT="${E2E_DB_PORT:-${ALVM_DB_PORT:-5436}}"
BACK_PORT="${E2E_BACK_PORT:-4102}"
FRONT_PORT="${E2E_FRONT_PORT:-3102}"
FRONT_MODE="${E2E_FRONT_MODE:-build}"
STATE_DIR="${E2E_STATE_DIR:-${TMPDIR:-/tmp}/alvm-e2e}"
STATE_DIR="${STATE_DIR%/}"
REDIS_URL_E2E="${E2E_REDIS_URL:-redis://127.0.0.1:${ALVM_REDIS_PORT:-6380}/14}"

# Identifiants du PostgreSQL de DÉVELOPPEMENT (deploy/postgres/init-dev.sql) —
# jamais ceux d'un environnement partagé.
APP_URL="postgresql://alvm_app:alvm_app@127.0.0.1:${DB_PORT}/${DB_NAME}"
OWNER_URL="postgresql://postgres:postgres@127.0.0.1:${DB_PORT}/${DB_NAME}"

log() { printf '[e2e-stack] %s\n' "$*"; }
die() { printf '[e2e-stack] ERREUR : %s\n' "$*" >&2; exit 1; }

psql_owner() {
  # psql du conteneur compose (aucun client PostgreSQL requis sur le poste).
  docker compose -f "$ROOT/compose.yml" exec -T postgres psql -U postgres -v ON_ERROR_STOP=1 "$@"
}

port_busy() { lsof -iTCP:"$1" -sTCP:LISTEN -nP >/dev/null 2>&1; }

wait_http() {
  local url="$1" name="$2" tries="${3:-120}"
  for _ in $(seq "$tries"); do
    if curl -fsS -o /dev/null "$url" 2>/dev/null; then return 0; fi
    sleep 1
  done
  die "$name ne répond pas sur $url (journal : $STATE_DIR/$name.log)"
}

ensure_secrets() {
  mkdir -p "$STATE_DIR"
  chmod 700 "$STATE_DIR"
  if [[ ! -f "$STATE_DIR/secrets.env" ]]; then
    umask 077
    {
      echo "AUTH_SECRET=$(openssl rand -base64 32)"
      echo "INTERNAL_API_SECRET=$(openssl rand -hex 32)"
      echo "PLATFORM_ENCRYPTION_KEY=$(openssl rand -base64 32)"
    } >"$STATE_DIR/secrets.env"
    log "secrets du banc générés ($STATE_DIR/secrets.env)"
  fi
  set -a
  # shellcheck disable=SC1091
  source "$STATE_DIR/secrets.env"
  set +a
}

ensure_database() {
  docker compose -f "$ROOT/compose.yml" exec -T postgres pg_isready -U postgres >/dev/null \
    || die "PostgreSQL du compose.yml indisponible : lancer « docker compose up -d »"
  if [[ "$(psql_owner -tAc "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'")" != "1" ]]; then
    log "création de la base ${DB_NAME}"
    psql_owner -c "CREATE DATABASE ${DB_NAME}" >/dev/null
  fi
  psql_owner -c "GRANT CONNECT ON DATABASE ${DB_NAME} TO alvm_app" >/dev/null
}

migrate_and_seed() {
  log "migrations + droits du rôle applicatif"
  (cd "$ROOT" && DATABASE_URL="$APP_URL" DATABASE_MIGRATION_URL="$OWNER_URL" \
    pnpm --silent --filter @alvm/back db:migrate) >"$STATE_DIR/migrate.log" 2>&1 \
    || die "migrations en échec (journal : $STATE_DIR/migrate.log)"
  log "seed de démonstration (idempotent : espaces existants ignorés)"
  (cd "$ROOT" && DATABASE_URL="$APP_URL" pnpm --silent --filter @alvm/back db:seed) \
    >"$STATE_DIR/seed.log" 2>&1 || die "seed en échec (journal : $STATE_DIR/seed.log)"
  # Quotas de connexion (10 / compte, 100 / origine par 15 min) : la recette se
  # connecte souvent, on repart d'un compteur vide à chaque montée du banc.
  psql_owner -d "$DB_NAME" -c "DELETE FROM login_attempts" >/dev/null
}

start_back() {
  port_busy "$BACK_PORT" && die "le port $BACK_PORT est déjà occupé"
  log "build du back"
  (cd "$ROOT" && pnpm --silent --filter @alvm/back build) >"$STATE_DIR/back-build.log" 2>&1 \
    || die "build du back en échec (journal : $STATE_DIR/back-build.log)"
  log "back sur :$BACK_PORT"
  (
    cd "$ROOT/alvm-back"
    NODE_ENV=production DATABASE_URL="$APP_URL" PORT="$BACK_PORT" \
      AUTH_URL="http://localhost:${FRONT_PORT}" REDIS_URL="$REDIS_URL_E2E" \
      nohup node dist/main.js >"$STATE_DIR/back.log" 2>&1 &
    echo $! >"$STATE_DIR/back.pid"
  )
  wait_http "http://127.0.0.1:${BACK_PORT}/api/health" back 60
}

start_front() {
  port_busy "$FRONT_PORT" && die "le port $FRONT_PORT est déjà occupé"
  local env=(
    API_INTERNAL_URL="http://127.0.0.1:${BACK_PORT}"
    AUTH_URL="http://localhost:${FRONT_PORT}"
  )
  if [[ "$FRONT_MODE" == "build" ]]; then
    log "build du front (next build)"
    (cd "$ROOT/alvm-front" && env "${env[@]}" pnpm exec next build) >"$STATE_DIR/front-build.log" 2>&1 \
      || die "build du front en échec (journal : $STATE_DIR/front-build.log)"
    log "front sur :$FRONT_PORT (next start)"
    (
      cd "$ROOT/alvm-front"
      env "${env[@]}" nohup pnpm exec next start -p "$FRONT_PORT" >"$STATE_DIR/front.log" 2>&1 &
      echo $! >"$STATE_DIR/front.pid"
    )
  else
    log "front sur :$FRONT_PORT (next dev)"
    (
      cd "$ROOT/alvm-front"
      env "${env[@]}" nohup pnpm exec next dev -p "$FRONT_PORT" >"$STATE_DIR/front.log" 2>&1 &
      echo $! >"$STATE_DIR/front.pid"
    )
  fi
  wait_http "http://127.0.0.1:${FRONT_PORT}/api/health" front 180
}

stop_pid() {
  local name="$1" file="$STATE_DIR/$1.pid"
  [[ -f "$file" ]] || return 0
  local pid
  pid="$(cat "$file")"
  if kill -0 "$pid" 2>/dev/null; then
    # Le front tourne sous `pnpm exec` : arrêter aussi les processus enfants.
    pkill -TERM -P "$pid" 2>/dev/null || true
    kill -TERM "$pid" 2>/dev/null || true
    for _ in $(seq 20); do kill -0 "$pid" 2>/dev/null || break; sleep 0.5; done
    kill -KILL "$pid" 2>/dev/null || true
    log "$name arrêté (pid $pid)"
  fi
  rm -f "$file"
}

free_port() {
  # Filet de sécurité : processus orphelins DU BANC (node du back ou de Next)
  # encore à l'écoute. Un autre programme sur ce port n'est jamais tué.
  local port="$1" pid command
  for pid in $(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true); do
    command="$(ps -o command= -p "$pid" 2>/dev/null || true)"
    if [[ "$command" == *"dist/main.js"* || "$command" == *next* ]]; then
      kill -TERM "$pid" 2>/dev/null || true
      log "port $port libéré (pid $pid)"
    fi
  done
  return 0
}

cmd_up() {
  command -v docker >/dev/null || die "docker requis"
  command -v openssl >/dev/null || die "openssl requis"
  ensure_secrets
  ensure_database
  migrate_and_seed
  start_back
  start_front
  log "banc prêt : http://localhost:${FRONT_PORT} (back :${BACK_PORT}, base ${DB_NAME})"
  log "recette   : scripts/e2e-stack.sh test"
}

cmd_down() {
  stop_pid front
  stop_pid back
  free_port "$FRONT_PORT"
  free_port "$BACK_PORT"
  log "banc arrêté (base ${DB_NAME} conservée)"
}

cmd_restart() {
  cmd_down
  ensure_secrets
  start_back
  start_front
  log "banc relancé : http://localhost:${FRONT_PORT}"
}

cmd_reset() {
  if port_busy "$BACK_PORT" || port_busy "$FRONT_PORT"; then
    die "banc démarré : « scripts/e2e-stack.sh down » d'abord"
  fi
  psql_owner -c "DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)" >/dev/null
  log "base ${DB_NAME} supprimée — « up » la recrée"
}

cmd_test() {
  ensure_secrets
  (
    cd "$ROOT/alvm-front"
    E2E_BASE_URL="${E2E_BASE_URL:-http://localhost:${FRONT_PORT}}" \
      E2E_BACK_URL="${E2E_BACK_URL:-http://127.0.0.1:${BACK_PORT}}" \
      E2E_EVIDENCE_DIR="${E2E_EVIDENCE_DIR-$ROOT/docs/test-evidence/recette-saas-3.0.0}" \
      pnpm exec playwright test "$@"
  )
}

# SEC-01 hors navigateur : sortie texte versée au dossier de preuves.
cmd_probe() {
  ensure_secrets
  local back="http://127.0.0.1:${BACK_PORT}" out
  local dir="${E2E_EVIDENCE_DIR-$ROOT/docs/test-evidence/recette-saas-3.0.0}"
  local input='%7B%22json%22%3A%7B%22slug%22%3A%22alvm%22%7D%7D'
  mkdir -p "$dir"
  out="$dir/SEC-01-back-secret-interne.txt"
  {
    echo "# SEC-01 — le back refuse toute requête sans secret interne (curl, $(date '+%Y-%m-%d %H:%M %Z'))"
    echo
    echo '$ curl -si '"$back"'/api/health'
    curl -si "$back/api/health" | sed -n '1p;$p'
    printf '\n\n'
    echo '$ curl -si '"$back"'/api/trpc/organizations.publicInfo?input=…            # sans secret'
    curl -si "$back/api/trpc/organizations.publicInfo?input=$input" | sed -n '1p;$p'
    printf '\n\n'
    echo '$ curl -si -H "x-internal-secret: <forgé>" '"$back"'/api/trpc/organizations.publicInfo?input=…'
    curl -si -H "x-internal-secret: $(printf 'f%.0s' $(seq 64))" \
      "$back/api/trpc/organizations.publicInfo?input=$input" | sed -n '1p;$p'
    printf '\n\n'
    echo '$ curl -si -X POST '"$back"'/api/internal/auth/credentials -d {…}              # sans secret'
    curl -si -X POST -H 'content-type: application/json' \
      -d '{"organization":"alvm","email":"admin@alvm.test","password":"x"}' \
      "$back/api/internal/auth/credentials" | sed -n '1p;$p'
    printf '\n\n'
    echo '$ curl -si -H "x-internal-secret: <secret du banc>" '"$back"'/api/trpc/organizations.publicInfo?input=…   # témoin'
    curl -si -H "x-internal-secret: $INTERNAL_API_SECRET" \
      "$back/api/trpc/organizations.publicInfo?input=$input" | sed -n '1p;$p'
    printf '\n\n'
  } | tr -d '\r' >"$out"
  cat "$out"
  log "sortie enregistrée : $out"
}

cmd_status() {
  for name in back front; do
    if [[ -f "$STATE_DIR/$name.pid" ]] && kill -0 "$(cat "$STATE_DIR/$name.pid")" 2>/dev/null; then
      log "$name : actif (pid $(cat "$STATE_DIR/$name.pid"))"
    else
      log "$name : arrêté"
    fi
  done
}

case "${1:-}" in
  up) cmd_up ;;
  down) cmd_down ;;
  restart) cmd_restart ;;
  reset) cmd_reset ;;
  test) shift; cmd_test "$@" ;;
  probe) cmd_probe ;;
  status) cmd_status ;;
  *) die "usage : $0 up | test [args playwright] | probe | restart | down | reset | status" ;;
esac
