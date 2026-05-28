#!/usr/bin/env bash
# Install and configure Caddy for self-hosted IEX deployment.
# Usage: ./infra/scripts/deploy-caddy.sh --ip YOUR_SERVER_IP
#
# Prerequisites: Ubuntu/Debian (uses apt). Adapt for other distros.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CADDYFILE_SRC="$REPO_ROOT/infra/caddy/Caddyfile"
SERVER_IP=""

for arg in "$@"; do
  case "$arg" in
    --ip)    shift; SERVER_IP="${1:-}" ;;
    --ip=*)  SERVER_IP="${arg#--ip=}" ;;
    *) ;;
  esac
done

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; NC='\033[0m'
info()  { echo -e "${GREEN}[deploy-caddy]${NC} $*"; }
warn()  { echo -e "${YELLOW}[deploy-caddy:warn]${NC} $*"; }
error() { echo -e "${RED}[deploy-caddy:error]${NC} $*" >&2; }

if [[ -z "$SERVER_IP" ]]; then
  # Auto-detect public IP
  SERVER_IP=$(curl -s --max-time 10 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
  warn "No --ip provided — detected IP: $SERVER_IP"
  warn "Pass --ip YOUR_SERVER_IP to override."
fi

# ── 1. Install Caddy ──────────────────────────────────────────────────────────
if command -v caddy &>/dev/null; then
  CADDY_VER=$(caddy version 2>/dev/null | head -1)
  info "Caddy already installed: $CADDY_VER"
else
  info "Installing Caddy via apt..."
  sudo apt-get update -qq
  sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | sudo tee /etc/apt/sources.list.d/caddy-stable.list
  sudo apt-get update -qq
  sudo apt-get install -y caddy
  info "Caddy installed: $(caddy version | head -1)"
fi

# ── 2. Deploy Caddyfile ───────────────────────────────────────────────────────
if [[ ! -f "$CADDYFILE_SRC" ]]; then
  error "Caddyfile not found: $CADDYFILE_SRC"
  exit 1
fi

info "Deploying Caddyfile for IP: $SERVER_IP"
sudo cp "$CADDYFILE_SRC" /etc/caddy/Caddyfile
sudo sed -i "s/168\.119\.15\.122/$SERVER_IP/g" /etc/caddy/Caddyfile

info "Validating Caddyfile..."
sudo caddy validate --config /etc/caddy/Caddyfile

# ── 3. Enable and start Caddy ─────────────────────────────────────────────────
info "Enabling Caddy systemd service..."
sudo systemctl enable caddy
sudo systemctl restart caddy
info "Caddy started."

# ── 4. Verify ─────────────────────────────────────────────────────────────────
sleep 2
if sudo systemctl is-active --quiet caddy; then
  info "Caddy is running."
  info "Test: curl -sI http://$SERVER_IP/v1/cannes/health"
else
  error "Caddy failed to start. Check: sudo journalctl -u caddy -n 50"
  exit 1
fi

echo ""
echo -e "${GREEN}Caddy deployed successfully.${NC}"
echo "  Server IP: $SERVER_IP"
echo "  Caddyfile: /etc/caddy/Caddyfile"
echo "  Status:    sudo systemctl status caddy"
echo "  Logs:      sudo journalctl -u caddy -f"
echo ""
echo "  IMPORTANT: Ensure ports 80/443 are open in your firewall."
echo "  Run security scan: ./infra/scripts/security-scan.sh --host http://$SERVER_IP"
