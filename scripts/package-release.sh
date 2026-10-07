#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
revision="${1:-}"
domain="${2:-}"
image_prefix="${3:-}"
[[ "$revision" =~ ^[a-f0-9]{40}$ ]] || { echo 'Expected a full Git commit SHA.' >&2; exit 1; }
[[ "$domain" =~ ^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$ ]] || { echo 'Expected a DNS domain.' >&2; exit 1; }
[[ "$image_prefix" =~ ^[a-z0-9]+([._-][a-z0-9]+)*$ ]] || { echo 'Expected an image prefix.' >&2; exit 1; }
umask 077
directory="$ROOT/.local-backups/ci-release"
mkdir -p "$directory"
printf '%s\n' "$revision" > "$directory/revision"
printf '%s\n' "$domain" > "$directory/domain"
printf '%s\n' "$image_prefix" > "$directory/image-prefix"
tar -czf "$directory/source.tar.gz" compose.production.yaml deploy/Dockerfile \
  deploy/Caddyfile deploy/init-databases.sh deploy/migrate.sh scripts/production.sh
cp scripts/deploy-release.sh "$directory/deploy-release.sh"
docker image save "$image_prefix-backend:$revision" "$image_prefix-web:$revision" "$image_prefix-migrate:$revision" \
  | gzip > "$directory/images.tar.gz"
cd "$directory"
sha256sum source.tar.gz images.tar.gz deploy-release.sh revision domain image-prefix > SHA256SUMS
printf '%s\n' 'Production release packaged without environment files or credentials.'
