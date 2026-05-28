#!/usr/bin/env bash
# Lightweight security scan against the running IEX stack.
# Usage: ./infra/scripts/security-scan.sh [--host http://localhost] [--report-dir docs/security]
#
# Checks:
#   - Security headers on /
#   - 403 for /.env, /package.json, /.git/config
#   - 200 for /v1/cannes/health
#   - Server header absent/redacted
#   - CORS credentials not wildcard
#
# Writes a timestamped Markdown report to $REPORT_DIR/scan-YYYYMMDD.md
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HOST="http://localhost"
REPORT_DIR="$REPO_ROOT/docs/security"

for arg in "$@"; do
  case "$arg" in
    --host)      shift; HOST="${1:-$HOST}" ;;
    --host=*)    HOST="${arg#--host=}" ;;
    --report-dir) shift; REPORT_DIR="${1:-$REPORT_DIR}" ;;
    --report-dir=*) REPORT_DIR="${arg#--report-dir=}" ;;
    *) ;;
  esac
done

mkdir -p "$REPORT_DIR"
REPORT_FILE="$REPORT_DIR/scan-$(date +%Y%m%d).md"

RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; NC='\033[0m'
PASS="${GREEN}[PASS]${NC}"; FAIL="${RED}[FAIL]${NC}"; WARN="${YELLOW}[WARN]${NC}"

PASS_COUNT=0; FAIL_COUNT=0; WARN_COUNT=0
REPORT_LINES=()

header() {
  echo -e "\n${YELLOW}── $* ──${NC}"
}

record() {
  local status="$1"; local label="$2"; local detail="${3:-}"
  case "$status" in
    pass) echo -e "$PASS $label"; ((PASS_COUNT++)); REPORT_LINES+=("| ✅ | $label | $detail |") ;;
    fail) echo -e "$FAIL $label"; ((FAIL_COUNT++)); REPORT_LINES+=("| ❌ | $label | $detail |") ;;
    warn) echo -e "$WARN $label"; ((WARN_COUNT++)); REPORT_LINES+=("| ⚠️  | $label | $detail |") ;;
  esac
}

echo "Security scan → $HOST"
echo "Report will be written to: $REPORT_FILE"

# ── Security headers ──────────────────────────────────────────────────────────
header "Security headers"

HEADERS=$(curl -sI --max-time 10 "$HOST/" 2>/dev/null || true)

check_header() {
  local name="$1"; local pattern="$2"
  if echo "$HEADERS" | grep -qi "$pattern"; then
    record pass "Header present: $name"
  else
    record fail "Header missing: $name" "Expected: $pattern"
  fi
}

check_header "X-Frame-Options"         "x-frame-options"
check_header "X-Content-Type-Options"  "x-content-type-options"
check_header "Referrer-Policy"         "referrer-policy"

SERVER_HEADER=$(echo "$HEADERS" | grep -i "^server:" | head -1 | tr -d '\r')
if [[ -z "$SERVER_HEADER" ]]; then
  record pass "Server header absent (redacted)"
else
  record warn "Server header present: $SERVER_HEADER" "Strip with Caddy: -Server"
fi

# ── Sensitive path blocking ────────────────────────────────────────────────────
header "Sensitive path blocking"

check_403() {
  local path="$1"
  local status
  status=$(curl -so /dev/null -w "%{http_code}" --max-time 10 "$HOST$path" 2>/dev/null || echo "000")
  if [[ "$status" == "403" || "$status" == "404" ]]; then
    record pass "Blocked ($status): $path"
  else
    record fail "NOT blocked ($status): $path" "Expected 403 or 404"
  fi
}

check_403 "/.env"
check_403 "/package.json"
check_403 "/.git/config"
check_403 "/.npmrc"

# ── Health endpoint ────────────────────────────────────────────────────────────
header "Health endpoint"

HEALTH_STATUS=$(curl -so /dev/null -w "%{http_code}" --max-time 10 "$HOST/v1/cannes/health" 2>/dev/null || echo "000")
if [[ "$HEALTH_STATUS" == "200" ]]; then
  record pass "Health endpoint /v1/cannes/health → 200"
else
  # Try /health directly (broker without proxy)
  HEALTH2=$(curl -so /dev/null -w "%{http_code}" --max-time 10 "${HOST%:*}:3001/health" 2>/dev/null || echo "000")
  if [[ "$HEALTH2" == "200" ]]; then
    record warn "/v1/cannes/health returned $HEALTH_STATUS; /health on port 3001 returned 200 (check proxy)"
  else
    record fail "Health endpoint unreachable ($HEALTH_STATUS)" "Ensure broker is running"
  fi
fi

# ── CORS credentials check ────────────────────────────────────────────────────
header "CORS credentials check"

CORS_HEADERS=$(curl -sI --max-time 10 \
  -H "Origin: https://evil.example.com" \
  -H "Access-Control-Request-Method: GET" \
  "$HOST/v1/cannes/health" 2>/dev/null || true)

ACAO=$(echo "$CORS_HEADERS" | grep -i "^access-control-allow-origin:" | tr -d '\r')
ACAC=$(echo "$CORS_HEADERS" | grep -i "^access-control-allow-credentials:" | tr -d '\r')

if echo "$ACAO" | grep -q "\*"; then
  if echo "$ACAC" | grep -qi "true"; then
    record fail "CORS: wildcard origin + credentials=true (OWASP A05)" "$ACAO | $ACAC"
  else
    record warn "CORS: wildcard origin allowed (no credentials)" "$ACAO"
  fi
elif [[ -z "$ACAO" ]]; then
  record pass "CORS: no ACAO header returned for unknown origin (correctly restricted)"
else
  record pass "CORS origin explicitly set (not wildcard)" "$ACAO"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "────────────────────────────────"
echo -e "  ${GREEN}PASS${NC}: $PASS_COUNT  ${RED}FAIL${NC}: $FAIL_COUNT  ${YELLOW}WARN${NC}: $WARN_COUNT"
echo "────────────────────────────────"

# ── Write Markdown report ─────────────────────────────────────────────────────
{
  echo "# IEX Security Scan — $(date '+%Y-%m-%d %H:%M UTC')"
  echo ""
  echo "**Host:** \`$HOST\`"
  echo ""
  echo "## Results"
  echo ""
  echo "| Status | Check | Detail |"
  echo "|--------|-------|--------|"
  for line in "${REPORT_LINES[@]}"; do
    echo "$line"
  done
  echo ""
  echo "## Summary"
  echo ""
  echo "- Pass: **$PASS_COUNT**"
  echo "- Fail: **$FAIL_COUNT**"
  echo "- Warn: **$WARN_COUNT**"
  echo ""
  echo "_Generated by \`infra/scripts/security-scan.sh\`_"
} > "$REPORT_FILE"

echo "Report written: $REPORT_FILE"

# Exit with failure if any checks failed
if [[ "$FAIL_COUNT" -gt 0 ]]; then
  exit 1
fi
