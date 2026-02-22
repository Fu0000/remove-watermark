#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FORCE=0
DRY_RUN=0
LOCAL_BASE_URL="${LOCAL_BASE_URL:-http://127.0.0.1:3000}"

usage() {
  cat <<'EOF'
Usage:
  scripts/setup-admin-env.sh [--force] [--dry-run]

Description:
  Generate shared/staging/prod .env files for:
  - apps/api-gateway
  - apps/admin-console

Options:
  --force    overwrite existing target files
  --dry-run  print target files and masked values without writing
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force)
      FORCE=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

generate_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
    return
  fi
  od -An -N32 -tx1 /dev/urandom | tr -d ' \n'
}

mask_secret() {
  local raw="$1"
  local head="${raw:0:6}"
  local tail="${raw: -4}"
  printf "%s****%s" "$head" "$tail"
}

write_file() {
  local file_path="$1"
  local content="$2"

  if [[ -f "$file_path" && "$FORCE" -ne 1 ]]; then
    echo "[skip] exists: $file_path (use --force to overwrite)"
    return
  fi

  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "[dry-run] write: $file_path"
    return
  fi

  mkdir -p "$(dirname "$file_path")"
  printf "%s\n" "$content" > "$file_path"
  chmod 600 "$file_path"
  echo "[ok] wrote: $file_path"
}

render_api_gateway_env() {
  local app_env="$1"
  local admin_secret="$2"
  cat <<EOF
PORT=3000
NODE_ENV=production
APP_ENV=$app_env
ADMIN_RBAC_SECRET=$admin_secret
EOF
}

render_admin_console_env() {
  local app_env="$1"
  local admin_secret="$2"
  cat <<EOF
APP_ENV=$app_env
NEXT_PUBLIC_API_BASE_URL=$LOCAL_BASE_URL
NEXT_PUBLIC_SHARED_AUTH_CODE=admin
NEXT_PUBLIC_SHARED_USERNAME=admin
NEXT_PUBLIC_SHARED_PASSWORD=admin123
ADMIN_PROXY_ROLE=admin
ADMIN_PROXY_AUTH_CODE=admin
ADMIN_PROXY_USERNAME=admin
ADMIN_PROXY_PASSWORD=admin123
ADMIN_PROXY_SECRET=$admin_secret
EOF
}

for target_env in shared staging prod; do
  secret="$(generate_secret)"
  masked="$(mask_secret "$secret")"
  api_file="$ROOT_DIR/apps/api-gateway/.env.$target_env"
  admin_file="$ROOT_DIR/apps/admin-console/.env.$target_env"

  echo "[info] env=$target_env secret=$masked"

  write_file "$api_file" "$(render_api_gateway_env "$target_env" "$secret")"
  write_file "$admin_file" "$(render_admin_console_env "$target_env" "$secret")"
done

echo "[done] admin env setup completed."
