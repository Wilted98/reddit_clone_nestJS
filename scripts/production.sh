#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
ENV_FILE="$ROOT/deploy/.env.production"
umask 077

# Automated releases keep secrets shared but pin their own immutable image tag.
if [[ -f "$ROOT/deploy/.image-tag" ]]; then
  IFS= read -r IMAGE_TAG < "$ROOT/deploy/.image-tag"
  [[ "$IMAGE_TAG" =~ ^[a-f0-9]{40}$ ]] || { echo 'Invalid release image tag.' >&2; exit 1; }
  export IMAGE_TAG
fi

if [[ "${1:-}" == init ]]; then
  if [[ -e "$ENV_FILE" ]]; then
    printf '%s\n' 'Production configuration already exists; keeping current secrets.'
    exit 0
  fi
  domain="${DOMAIN:-}"
  prefix="${IMAGE_PREFIX:-app}"
  project="${COMPOSE_PROJECT_NAME:-$prefix-production}"
  [[ "$domain" =~ ^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$ ]] || { echo 'Set DOMAIN to your public DNS domain before init.' >&2; exit 1; }
  [[ "$prefix" =~ ^[a-z0-9]+([._-][a-z0-9]+)*$ ]] || { echo 'Invalid IMAGE_PREFIX.' >&2; exit 1; }
  [[ "$project" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || { echo 'Invalid COMPOSE_PROJECT_NAME.' >&2; exit 1; }
  command -v openssl >/dev/null
  # noclobber protects an existing configuration, including concurrent init calls.
  set -o noclobber
  {
    printf 'DOMAIN=%s\nIMAGE_PREFIX=%s\nCOMPOSE_PROJECT_NAME=%s\nIMAGE_TAG=local\n' "$domain" "$prefix" "$project"
    printf 'POSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 32)"
    printf 'AUTH_DATABASE_PASSWORD=%s\n' "$(openssl rand -hex 32)"
    printf 'SOCIAL_DATABASE_PASSWORD=%s\n' "$(openssl rand -hex 32)"
    printf 'JWT_SECRET=%s\n' "$(openssl rand -hex 64)"
    printf 'JWT_EXPIRATION_MS=604800000\n'
  } > "$ENV_FILE"
  printf '%s\n' 'Created private deploy/.env.production. Keep it stable and back it up securely.'
  exit 0
fi

if [[ ! -f "$ENV_FILE" ]]; then
  printf '%s\n' 'Run bash scripts/production.sh init first.' >&2
  exit 1
fi
COMPOSE_PROJECT_NAME="$(sed -n 's/^COMPOSE_PROJECT_NAME=//p' "$ENV_FILE")"
[[ "$COMPOSE_PROJECT_NAME" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || { echo 'Set COMPOSE_PROJECT_NAME in production configuration; keep the existing project name for installed deployments.' >&2; exit 1; }
IMAGE_PREFIX="$(sed -n 's/^IMAGE_PREFIX=//p' "$ENV_FILE")"
if [[ -f "$ROOT/deploy/.image-prefix" ]]; then
  IFS= read -r IMAGE_PREFIX < "$ROOT/deploy/.image-prefix"
fi
[[ "$IMAGE_PREFIX" =~ ^[a-z0-9]+([._-][a-z0-9]+)*$ ]] || { echo 'Set a valid IMAGE_PREFIX in production configuration.' >&2; exit 1; }
export COMPOSE_PROJECT_NAME IMAGE_PREFIX
compose() { docker compose --env-file "$ENV_FILE" -f compose.production.yaml "$@"; }
backup() {
  local directory
  directory="$ROOT/.local-backups/production-$(date -u +%Y%m%dT%H%M%SZ)-$$"
  mkdir -p "$directory"
  for service in auth social; do
    compose exec -T postgres pg_dump -U roorin -Fc "roorin_$service" > "$directory/$service.dump"
  done
  printf 'Database backups: %s\n' "$directory"
}

compose config --quiet
case "${1:-}" in
  build) compose --profile tools build auth web migrate ;;
  export)
    tag="${IMAGE_TAG:-$(sed -n 's/^IMAGE_TAG=//p' "$ENV_FILE")}"
    tag="${tag:-local}"
    mkdir -p .local-backups
    docker image save "$IMAGE_PREFIX-backend:$tag" "$IMAGE_PREFIX-web:$tag" "$IMAGE_PREFIX-migrate:$tag" | gzip > .local-backups/production-images.tar.gz
    printf '%s\n' 'Images exported to .local-backups/production-images.tar.gz.'
    ;;
  up)
    compose up -d --no-build --wait postgres
    backup
    compose run --rm --no-deps migrate
    compose up -d --no-build --wait auth social web proxy
    ;;
  backup) backup ;;
  down) compose down ;;
  status) compose ps ;;
  logs) compose logs --tail=100 -f ;;
  *) printf '%s\n' 'Usage: bash scripts/production.sh {init|build|export|up|backup|down|status|logs}' >&2; exit 1 ;;
esac
