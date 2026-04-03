#!/usr/bin/env bash
set -euo pipefail

if command -v forge >/dev/null 2>&1; then
  exec forge "$@"
fi

if [ -x "/root/.foundry/bin/forge" ]; then
  exec /root/.foundry/bin/forge "$@"
fi

echo "forge not found in PATH and /root/.foundry/bin/forge is unavailable" >&2
exit 127
