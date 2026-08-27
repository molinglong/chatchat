#!/usr/bin/env bash
# =========================================================
# aichatt VPS ???????# ????Ubuntu 22.04+ / Debian 12+
#
# ??:
#   1) cd deploy && cp .env.production.example .env.production
#   2) ?? .env.production (?? PASSWORD/SECRET/DOMAIN/EMAIL)
#   3) ./deploy.sh init   # ??: ??docker + ???? + ???????#   4) ./deploy.sh up     # ??: ????????#   5) ./deploy.sh down   # ???????#   6) ./deploy.sh logs   # ????#   7) ./deploy.sh backup # ??????#   8) ./deploy.sh update # ????+ ????
# =========================================================
set -euo pipefail

# ??
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[$(date +%H:%M:%S)]${NC} $*"; }
ok()   { echo -e "${GREEN}??{NC} $*"; }
warn() { echo -e "${YELLOW}!${NC} $*"; }
err()  { echo -e "${RED}??{NC} $*"; }

# ??????
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$SCRIPT_DIR/.env.production"

if [ -f "$ENV_FILE" ]; then
  set -a; . "$ENV_FILE"; set +a
else
  err "????$ENV_FILE"
  err "?? cp $SCRIPT_DIR/.env.production.example $ENV_FILE ????
  exit 1
fi

: "${POSTGRES_PASSWORD:?????POSTGRES_PASSWORD}"
: "${AUTH_SECRET:?????AUTH_SECRET}"
: "${AUTH_URL:?????AUTH_URL}"
: "${DOMAIN:?????DOMAIN}"
: "${CERTBOT_EMAIL:?????CERTBOT_EMAIL}"

export POSTGRES_USER="${POSTGRES_USER:-admin}"
export POSTGRES_DB="${POSTGRES_DB:-aichatt}"
export COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
export COMPOSE_PROJECT_NAME=aichatt

# docker compose ???? .env,???????? .env.production,??????
DC="docker compose --env-file $ENV_FILE"

# ---------- ???? ----------
ensure_docker() {
  if command -v docker >/dev/null 2>&1 && $DC version >/dev/null 2>&1; then
    ok "Docker ????
    return
  fi
  warn "???? docker,??????..."
  if [ "$(id -u)" -ne 0 ]; then
    err "???root ????docker,?? sudo ??"
    exit 1
  fi
  curl -fsSL https://get.docker.com | sh
  ok "Docker ????"
}

ensure_dns() {
  log "?????$DOMAIN ????????.."
  local resolved
  resolved="$(getent hosts "$DOMAIN" 2>/dev/null | awk '{print $1}' | head -1 || true)"
  if [ -z "$resolved" ]; then
    err "$DOMAIN ?? DNS ??,?????? A ?????? IP"
    exit 1
  fi
  local my_ip
  my_ip="$(curl -fs https://api.ipify.org 2>/dev/null || curl -fs https://ifconfig.me 2>/dev/null || echo unknown)"
  if [ "$resolved" != "$my_ip" ] && [ "$my_ip" != "unknown" ]; then
    warn "DNS ??($resolved)??????IP($my_ip)????
    warn "???? DNS,?????????;????..."
  else
    ok "DNS ???? ??$resolved"
  fi
}

wait_for_healthy() {
  local container="$1"
  local timeout="${2:-120}"
  log "?? $container ??..."
  for i in $(seq 1 "$timeout"); do
    local state
    state="$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo unknown)"
    if [ "$state" = "healthy" ]; then
      ok "$container ??healthy"
      return
    fi
    sleep 1
  done
  err "$container ?? ${timeout}s ????healthy ???
  docker logs --tail 50 "$container" || true
  exit 1
}

apply_https_config() {
  log "?? HTTPS nginx ??..."
  local conf_dir="$SCRIPT_DIR/nginx/conf.d"
  local tmpl="$conf_dir/app.conf.https.tmpl"
  local out="$conf_dir/app.conf"
  sed "s|__DOMAIN__|$DOMAIN|g" "$tmpl" > "$out"
  ok "HTTPS ??????$out"
}

apply_uploads_dir() {
  # ??uploads ???????? nginx ?? serve ????  # ????: app ????/app/uploads ????,nginx ???? alias /var/www/uploads/ ??serve
  # ????????????/????? ??,?????
  # ??: ??app ?? serve /uploads,?? nginx alias
  warn "/uploads/ ????Next.js ??,????Nginx"
}

# ---------- ?? ----------
cmd_init() {
  log "==== ??????===="
  ensure_docker
  ensure_dns

  cd "$SCRIPT_DIR"

  # 1. ???? nginx,????????  log "1) ?? nginx (HTTP only)..."
  $DC up -d nginx

  # 2. ????
  log "2) ?? Let's Encrypt ??..."
  $DC run --rm certbot certonly \
    --webroot --webroot-path /var/www/certbot \
    --email "$CERTBOT_EMAIL" --agree-tos --no-eff-email \
    -d "$DOMAIN"

  # 3. ??HTTPS ??
  apply_https_config

  # 4. ??????
  log "3) ???????.."
  $DC up -d --build

  # 5. ??????
  log "4) ????????.."
  $DC exec -T app npx prisma migrate deploy

  apply_uploads_dir

  log "5) ???? nginx..."
  $DC exec nginx nginx -s reload

  ok "????: ?? https://$DOMAIN"
}

cmd_up() {
  cd "$SCRIPT_DIR"
  apply_https_config
  log "??????????.."
  $DC up -d --build
  log "????????.."
  $DC exec -T app npx prisma migrate deploy
  $DC exec nginx nginx -s reload 2>/dev/null || true
  ok "??????
  $DC ps
}

cmd_down() {
  cd "$SCRIPT_DIR"
  log "???????.."
  $DC down
  ok "????
}

cmd_logs() {
  cd "$SCRIPT_DIR"
  $DC logs -f --tail 100 "${@:-}"
}

cmd_backup() {
  cd "$SCRIPT_DIR"
  local stamp
  stamp="$(date +%Y%m%d-%H%M%S)"
  local out="$SCRIPT_DIR/backups/aichatt-$stamp.dump"
  mkdir -p "$SCRIPT_DIR/backups"
  log "????????$out"
  docker exec aichatt-postgres pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" > "$out"
  ok "????: $out ($(du -h "$out" | cut -f1))"
}

cmd_update() {
  log "???????.."
  cd "$PROJECT_ROOT"
  git pull --rebase --autostash
  log "????..."
  cmd_up
}

cmd_restart() {
  cd "$SCRIPT_DIR"
  local svc="${1:-app}"
  log "?? $svc..."
  $DC restart "$svc"
  ok "????$svc"
}

cmd_shell() {
  cd "$SCRIPT_DIR"
  local svc="${1:-app}"
  $DC exec "$svc" /bin/sh
}

cmd_ps() {
  cd "$SCRIPT_DIR"
  $DC ps
}

# ---------- main ----------
case "${1:-}" in
  init)    cmd_init ;;
  up)      cmd_up ;;
  down)    cmd_down ;;
  logs)    shift; cmd_logs "$@" ;;
  ps)      cmd_ps ;;
  backup)  cmd_backup ;;
  update)  cmd_update ;;
  restart) shift; cmd_restart "$@" ;;
  shell)   shift; cmd_shell "$@" ;;
  *)
    cat <<EOF
??: $0 <??>

??:
  init     ????????docker / ???? / ???? / ????
  up       ??????????????)
  down     ???????  ps       ???????  logs     ????(???????? logs app)
  backup   ?????? deploy/backups/
  update   git pull + ????
  restart  ??????(?? restart app)
  shell    ???? shell(?? shell app)
EOF
    exit 1
    ;;
esac

