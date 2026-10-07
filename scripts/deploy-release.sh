#!/usr/bin/env bash
set -euo pipefail
deploy_path="${1:-}"
revision="${2:-}"
release_id="${3:-}"
[[ "$deploy_path" =~ ^/[a-zA-Z0-9_/-]+$ && "$deploy_path" != / ]] || { echo 'Invalid deployment path.' >&2; exit 1; }
[[ "$revision" =~ ^[a-f0-9]{40}$ && "$release_id" =~ ^${revision}-[0-9]+-[0-9]+$ ]] || { echo 'Invalid release identity.' >&2; exit 1; }
umask 077
cd "$deploy_path/incoming/$release_id"
sha256sum -c SHA256SUMS
[[ "$(< revision)" == "$revision" ]] || { echo 'Bundle commit does not match the requested release.' >&2; exit 1; }
domain="$(< domain)"
image_prefix="$(< image-prefix)"
[[ "$domain" =~ ^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$ ]] || { echo 'Invalid build domain.' >&2; exit 1; }
[[ "$image_prefix" =~ ^[a-z0-9]+([._-][a-z0-9]+)*$ ]] || { echo 'Invalid image prefix.' >&2; exit 1; }
configuration="$deploy_path/.env.production"
[[ -f "$configuration" && ! -L "$configuration" ]] || { echo 'Install the existing production .env file first.' >&2; exit 1; }
[[ "$(stat -c '%a' "$configuration")" == 600 ]] || { echo 'Production configuration must have mode 600.' >&2; exit 1; }
[[ "$(sed -n 's/^DOMAIN=//p' "$configuration")" == "$domain" ]] || { echo 'Build domain differs from the VPS configuration; rebuild with the matching domain.' >&2; exit 1; }
[[ "$(sed -n 's/^IMAGE_PREFIX=//p' "$configuration")" == "$image_prefix" ]] || { echo 'Image prefix differs from the VPS configuration.' >&2; exit 1; }
project="$(sed -n 's/^COMPOSE_PROJECT_NAME=//p' "$configuration")"
[[ "$project" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || { echo 'Set COMPOSE_PROJECT_NAME; preserve the existing name on an installed deployment.' >&2; exit 1; }
mkdir -p "$deploy_path/releases" "$deploy_path/backups"
[[ ! -e "$deploy_path/current" || -L "$deploy_path/current" ]] || { echo 'Current release path must be a symlink.' >&2; exit 1; }
exec 9> "$deploy_path/.deploy.lock"
flock -n 9 || { echo 'Another deployment is already running.' >&2; exit 1; }
release="$deploy_path/releases/$release_id"
[[ ! -e "$release" ]] || { echo 'Release directory already exists; rerun the workflow for a new attempt.' >&2; exit 1; }
mkdir "$release"
tar -xzf source.tar.gz --no-same-owner -C "$release"
ln -s "$configuration" "$release/deploy/.env.production"
ln -s "$deploy_path/backups" "$release/.local-backups"
printf '%s\n' "$revision" > "$release/deploy/.image-tag"
printf '%s\n' "$image_prefix" > "$release/deploy/.image-prefix"
sudo -n docker image load -i images.tar.gz
for image in backend web migrate; do
  actual="$(sudo -n docker image inspect --format '{{.Architecture}} {{index .Config.Labels "org.opencontainers.image.revision"}}' "$image_prefix-$image:$revision")"
  [[ "$actual" == "amd64 $revision" ]] || { echo "Invalid architecture/commit label on $image image." >&2; exit 1; }
done
sudo -n bash "$release/scripts/production.sh" up
sudo -n bash "$release/scripts/production.sh" status
# Switch the operator entry point only after Compose reports healthy services.
if [[ -L "$deploy_path/current" ]]; then
  ln -sfn "$(readlink "$deploy_path/current")" "$deploy_path/previous"
fi
ln -sfn "$release" "$deploy_path/current.next"
mv -Tf "$deploy_path/current.next" "$deploy_path/current"
rm -- images.tar.gz source.tar.gz
# Remove only this deployment's obsolete commit tags, never volumes or other projects.
previous_tag=''
if [[ -f "$deploy_path/previous/deploy/.image-tag" ]]; then
  previous_tag="$(< "$deploy_path/previous/deploy/.image-tag")"
fi
for candidate in "$deploy_path/releases/"*/deploy/.image-tag; do
  [[ -f "$candidate" ]] || continue
  tag="$(< "$candidate")"
  [[ "$tag" =~ ^[a-f0-9]{40}$ ]] || continue
  prefix_file="$(dirname "$candidate")/.image-prefix"
  [[ -f "$prefix_file" ]] || continue
  prefix="$(< "$prefix_file")"
  [[ "$prefix" =~ ^[a-z0-9]+([._-][a-z0-9]+)*$ ]] || continue
  [[ "$tag" != "$revision" && "$tag" != "$previous_tag" ]] || continue
  if ! sudo -n docker image rm "$prefix-backend:$tag" "$prefix-web:$tag" "$prefix-migrate:$tag"; then
    printf 'Could not remove obsolete images for %s; inspect disk usage.\n' "$tag" >&2
  fi
done
printf 'Deployed %s. Current release: %s/current\n' "$revision" "$deploy_path"
