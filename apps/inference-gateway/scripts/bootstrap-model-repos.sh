#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
REPO_BASE="${1:-$ROOT_DIR/.runtime/model-repos}"

mkdir -p "$REPO_BASE"

if [ ! -d "$REPO_BASE/lama/.git" ]; then
  git clone --depth 1 https://github.com/advimman/lama.git "$REPO_BASE/lama"
else
  git -C "$REPO_BASE/lama" pull --ff-only
fi

if [ ! -d "$REPO_BASE/propainter/.git" ]; then
  git clone --depth 1 https://github.com/sczhou/ProPainter.git "$REPO_BASE/propainter"
else
  git -C "$REPO_BASE/propainter" pull --ff-only
fi

echo "model repos are ready under: $REPO_BASE"
