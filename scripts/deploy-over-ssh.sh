#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
revision="${1:-}"
release_id="${2:-}"
host="${VPS_HOST:-}"
user="${VPS_USER:-}"
port="${VPS_PORT:-22}"
deploy_path="${VPS_DEPLOY_PATH:-}"
[[ "$revision" =~ ^[a-f0-9]{40}$ && "$release_id" =~ ^${revision}-[0-9]+-[0-9]+$ ]] || { echo 'Invalid release identity.' >&2; exit 1; }
[[ "$host" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ && "$user" =~ ^[a-z_][a-z0-9_-]*$ ]] || { echo 'Set a valid VPS_HOST and VPS_USER.' >&2; exit 1; }
if [[ ! "$port" =~ ^[0-9]{1,5}$ ]] || (( 10#$port < 1 || 10#$port > 65535 )); then
  echo 'Invalid VPS_PORT.' >&2
  exit 1
fi
[[ "$deploy_path" =~ ^/[a-zA-Z0-9_/-]+$ && "$deploy_path" != / ]] || { echo 'Use an absolute VPS_DEPLOY_PATH without spaces or dot segments.' >&2; exit 1; }
[[ -n "${VPS_SSH_PRIVATE_KEY:-}" && -n "${VPS_SSH_KNOWN_HOSTS:-}" ]] || { echo 'Set VPS_SSH_PRIVATE_KEY and VPS_SSH_KNOWN_HOSTS secrets.' >&2; exit 1; }
umask 077
temporary="$(mktemp -d)"
trap 'rm -rf -- "$temporary"' EXIT
printf '%s\n' "$VPS_SSH_PRIVATE_KEY" > "$temporary/key"
printf '%s\n' "$VPS_SSH_KNOWN_HOSTS" > "$temporary/known_hosts"
unset VPS_SSH_PRIVATE_KEY VPS_SSH_KNOWN_HOSTS
ssh-keygen -y -P '' -f "$temporary/key" > /dev/null
printf '%s\n' \
  'Host deployment-target' "  HostName $host" "  User $user" "  Port $port" \
  "  IdentityFile $temporary/key" "  UserKnownHostsFile $temporary/known_hosts" \
  '  StrictHostKeyChecking yes' '  BatchMode yes' '  IdentitiesOnly yes' \
  '  ConnectTimeout 15' '  ServerAliveInterval 15' '  ServerAliveCountMax 4' \
  > "$temporary/config"
incoming="$deploy_path/incoming/$release_id"
ssh -F "$temporary/config" deployment-target \
  "test -f '$deploy_path/.env.production' && umask 077 && mkdir -p '$incoming'"
scp -F "$temporary/config" \
  "$ROOT/.local-backups/ci-release/"{SHA256SUMS,revision,domain,image-prefix,source.tar.gz,images.tar.gz,deploy-release.sh} \
  "deployment-target:$incoming/"
ssh -F "$temporary/config" deployment-target \
  "cd '$incoming' && sha256sum -c SHA256SUMS && bash deploy-release.sh '$deploy_path' '$revision' '$release_id'"
