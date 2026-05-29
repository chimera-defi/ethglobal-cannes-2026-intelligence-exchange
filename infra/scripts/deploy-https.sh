#!/usr/bin/env bash
# Deploy HTTPS configuration for Assay Protocol with Let's Encrypt.
# Usage: ./infra/scripts/deploy-https.sh app.assayprotocol.io
#
# Prerequisites:
# - DNS must point to 168.119.15.122
# - Ports 80 and 443 must be open
# - Caddy must be installed
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CADDYFILE_HTTPS_SRC="$REPO_ROOT/infra/caddy/Caddyfile.https"
DOMAIN="${1:-}"
BROKER_ENV="$REPO_ROOT/packages/intelligence-exchange-cannes-broker/.env"

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; NC='\033[0m'
info()  { echo -e "${GREEN}[deploy-https]${NC} $*"; }
warn()  { echo -e "${YELLOW}[deploy-https:warn]${NC} $*"; }
error() { echo -e "${RED}[deploy-https:error]${NC} $*" >&2; }

if [[ -z "$DOMAIN" ]]; then
  error "Domain required. Usage: $0 app.assayprotocol.io"
  exit 1
fi

# ── 1. Validate source files ───────────────────────────────────────────────────
if [[ ! -f "$CADDYFILE_HTTPS_SRC" ]]; then
  error "Caddyfile.https not found: $CADDYFILE_HTTPS_SRC"
  exit 1
fi

if [[ ! -f "$BROKER_ENV" ]]; then
  error "Broker .env not found: $BROKER_ENV"
  exit 1
fi

# ── 2. Deploy Caddyfile with domain substitution ───────────────────────────────
info "Deploying HTTPS Caddyfile for domain: $DOMAIN"
sed "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" "$CADDYFILE_HTTPS_SRC" | sudo tee /etc/caddy/Caddyfile > /dev/null

info "Validating Caddyfile..."
sudo caddy validate --config /etc/caddy/Caddyfile

# ── 3. Update CORS_ALLOWED_ORIGINS in broker .env ─────────────────────────────
info "Updating CORS_ALLOWED_ORIGINS in broker .env..."
if grep -q "^CORS_ALLOWED_ORIGINS=" "$BROKER_ENV"; then
  sed -i "s|^CORS_ALLOWED_ORIGINS=.*|CORS_ALLOWED_ORIGINS=https://$DOMAIN|g" "$BROKER_ENV"
else
  echo "CORS_ALLOWED_ORIGINS=https://$DOMAIN" >> "$BROKER_ENV"
fi

# ── 4. Restart Caddy service ─────────────────────────────────────────────────
info "Restarting Caddy service..."
sudo systemctl restart caddy

# ── 5. Verify ─────────────────────────────────────────────────────────────────
sleep 3
if sudo systemctl is-active --quiet caddy; then
  info "Caddy is running with HTTPS."
  info "Test: curl -sI https://$DOMAIN/v1/cannes/health"
else
  error "Caddy failed to start. Check: sudo journalctl -u caddy -n 50"
  exit 1
fi

echo ""
echo -e "${GREEN}HTTPS deployed successfully.${NC}"
echo "  Domain: $DOMAIN"
echo "  Caddyfile: /etc/caddy/Caddyfile"
echo "  CORS origin: https://$DOMAIN"
echo "  Status: sudo systemctl status caddy"
echo "  Logs: sudo journalctl -u caddy -f"
echo ""
echo "  IMPORTANT: Let's Encrypt certificates will be auto-obtained on first request."
echo "  Ensure DNS A record points to 168.119.15.122 before running this script."