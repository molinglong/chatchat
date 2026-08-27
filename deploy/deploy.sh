#!/usr/bin/env bash
# =========================================================
# aichatt VPS 一键部署脚本
# 适用于 Ubuntu 22.04+ / Debian 12+
#
# 用法:
#   1) cd deploy && cp .env.production.example .env.production
#   2) 填好 .env.production (尤其 PASSWORD/SECRET/DOMAIN/EMAIL)
#   3) ./deploy.sh init   # 首次: 装 docker + 申请证书 + 拉起所有服务
#   4) ./deploy.sh up     # 日常: 重新构建并启动
#   5) ./deploy.sh down   # 停掉所有服务
#   6) ./deploy.sh logs   # 看日志
#   7) ./deploy.sh backup # 备份数据库
#   8) ./deploy.sh update # 拉代码 + 重新部署
# =========================================================
set -euo pipefail

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[$(date +%H:%M:%S)]${NC} $*"; }
ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}!${NC} $*"; }
err()  { echo -e "${RED}✗${NC} $*"; }

# 解析环境文件
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$SCRIPT_DIR/.env.production"

if [ -f "$ENV_FILE" ]; then
  set -a; . "$ENV_FILE"; set +a
else
  err "未找到 $ENV_FILE"
  err "先: cp $SCRIPT_DIR/.env.production.example $ENV_FILE 并填好"
  exit 1
fi

: "${POSTGRES_PASSWORD:?未设置 POSTGRES_PASSWORD}"
: "${AUTH_SECRET:?未设置 AUTH_SECRET}"
: "${AUTH_URL:?未设置 AUTH_URL}"
: "${DOMAIN:?未设置 DOMAIN}"
: "${CERTBOT_EMAIL:?未设置 CERTBOT_EMAIL}"

export POSTGRES_USER="${POSTGRES_USER:-admin}"
export POSTGRES_DB="${POSTGRES_DB:-aichatt}"
export COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
export COMPOSE_PROJECT_NAME=aichatt

# ---------- 工具函数 ----------
ensure_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    ok "Docker 已安装"
    return
  fi
  warn "未检测到 docker,尝试自动安装..."
  if [ "$(id -u)" -ne 0 ]; then
    err "需要 root 权限装 docker,请用 sudo 重跑"
    exit 1
  fi
  curl -fsSL https://get.docker.com | sh
  ok "Docker 安装完成"
}

ensure_dns() {
  log "检查域名 $DOMAIN 是否解析到本机..."
  local resolved
  resolved="$(getent hosts "$DOMAIN" 2>/dev/null | awk '{print $1}' | head -1 || true)"
  if [ -z "$resolved" ]; then
    err "$DOMAIN 没有 DNS 解析,请先把域名的 A 记录指向本机 IP"
    exit 1
  fi
  local my_ip
  my_ip="$(curl -fs https://api.ipify.org 2>/dev/null || curl -fs https://ifconfig.me 2>/dev/null || echo unknown)"
  if [ "$resolved" != "$my_ip" ] && [ "$my_ip" != "unknown" ]; then
    warn "DNS 解析($resolved)与本机公网 IP($my_ip)不一致"
    warn "如果刚改 DNS,可能需要几分钟生效;继续尝试..."
  else
    ok "DNS 解析正常 → $resolved"
  fi
}

wait_for_healthy() {
  local container="$1"
  local timeout="${2:-120}"
  log "等待 $container 健康..."
  for i in $(seq 1 "$timeout"); do
    local state
    state="$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo unknown)"
    if [ "$state" = "healthy" ]; then
      ok "$container 已 healthy"
      return
    fi
    sleep 1
  done
  err "$container 未在 ${timeout}s 内进入 healthy 状态"
  docker logs --tail 50 "$container" || true
  exit 1
}

apply_https_config() {
  log "写入 HTTPS nginx 配置..."
  local conf_dir="$SCRIPT_DIR/nginx/conf.d"
  local tmpl="$conf_dir/app.conf.https.tmpl"
  local out="$conf_dir/app.conf"
  sed "s|__DOMAIN__|$DOMAIN|g" "$tmpl" > "$out"
  ok "HTTPS 配置已写入 $out"
}

apply_uploads_dir() {
  # 把 uploads 命名卷的入口挂到 nginx 可以 serve 的位置
  # 实际方案: app 容器的 /app/uploads 是命名卷,nginx 通过配置 alias /var/www/uploads/ 来 serve
  # 我们把命名卷里的内容软链/拷贝一份? 不行,卷是动态的
  # 解决: 让 app 直接 serve /uploads,不走 nginx alias
  warn "/uploads/ 直接由 Next.js 服务,不经过 Nginx"
}

# ---------- 命令 ----------
cmd_init() {
  log "==== 首次初始化 ===="
  ensure_docker
  ensure_dns

  cd "$SCRIPT_DIR"

  # 1. 临时启动 nginx,仅用于证书申请
  log "1) 启动 nginx (HTTP only)..."
  docker compose up -d nginx

  # 2. 申请证书
  log "2) 申请 Let's Encrypt 证书..."
  docker compose run --rm certbot certonly \
    --webroot --webroot-path /var/www/certbot \
    --email "$CERTBOT_EMAIL" --agree-tos --no-eff-email \
    -d "$DOMAIN"

  # 3. 写 HTTPS 配置
  apply_https_config

  # 4. 启动全部服务
  log "3) 启动所有服务..."
  docker compose up -d --build

  # 5. 跑数据库迁移
  log "4) 执行数据库迁移..."
  docker compose exec -T app npx prisma migrate deploy

  apply_uploads_dir

  log "5) 重新加载 nginx..."
  docker compose exec nginx nginx -s reload

  ok "全部就绪: 访问 https://$DOMAIN"
}

cmd_up() {
  cd "$SCRIPT_DIR"
  apply_https_config
  log "构建并启动所有服务..."
  docker compose up -d --build
  log "执行数据库迁移..."
  docker compose exec -T app npx prisma migrate deploy
  docker compose exec nginx nginx -s reload 2>/dev/null || true
  ok "服务已起来"
  docker compose ps
}

cmd_down() {
  cd "$SCRIPT_DIR"
  log "停止所有服务..."
  docker compose down
  ok "已停止"
}

cmd_logs() {
  cd "$SCRIPT_DIR"
  docker compose logs -f --tail 100 "${@:-}"
}

cmd_backup() {
  cd "$SCRIPT_DIR"
  local stamp
  stamp="$(date +%Y%m%d-%H%M%S)"
  local out="$SCRIPT_DIR/backups/aichatt-$stamp.dump"
  mkdir -p "$SCRIPT_DIR/backups"
  log "备份数据库 → $out"
  docker exec aichatt-postgres pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" > "$out"
  ok "备份完成: $out ($(du -h "$out" | cut -f1))"
}

cmd_update() {
  log "拉取最新代码..."
  cd "$PROJECT_ROOT"
  git pull --rebase --autostash
  log "重新部署..."
  cmd_up
}

cmd_restart() {
  cd "$SCRIPT_DIR"
  local svc="${1:-app}"
  log "重启 $svc..."
  docker compose restart "$svc"
  ok "已重启 $svc"
}

cmd_shell() {
  cd "$SCRIPT_DIR"
  local svc="${1:-app}"
  docker compose exec "$svc" /bin/sh
}

cmd_ps() {
  cd "$SCRIPT_DIR"
  docker compose ps
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
用法: $0 <命令>

命令:
  init     首次初始化(装 docker / 申请证书 / 拉起服务 / 跑迁移)
  up       构建并启动所有服务(日常重启)
  down     停止所有服务
  ps       查看容器状态
  logs     跟踪日志(可加服务名,例: logs app)
  backup   备份数据库到 deploy/backups/
  update   git pull + 重新部署
  restart  重启指定服务(例: restart app)
  shell    进入容器 shell(例: shell app)
EOF
    exit 1
    ;;
esac
