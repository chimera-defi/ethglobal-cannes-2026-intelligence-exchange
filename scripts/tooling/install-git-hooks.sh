#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HOOKS_DIR="${ROOT_DIR}/.githooks"
GIT_DIR="${ROOT_DIR}/.git"

if [[ ! -d "${GIT_DIR}" ]]; then
  echo "error: not inside a git repository"
  exit 1
fi

git config --local core.hooksPath "${HOOKS_DIR}"
echo "Git hooks installed from ${HOOKS_DIR}"
echo ""
echo "Active hooks:"
ls -1 "${HOOKS_DIR}"
