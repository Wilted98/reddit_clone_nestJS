#!/usr/bin/env bash
set -euo pipefail
if [[ "$EUID" -ne 0 ]]; then
  printf '%s\n' 'Run with sudo bash deploy/prepare-ubuntu.sh [--swap].' >&2
  exit 1
fi
if [[ "${1:-}" != '' && "${1:-}" != --swap ]]; then
  printf '%s\n' 'Usage: sudo bash deploy/prepare-ubuntu.sh [--swap]' >&2
  exit 1
fi
source /etc/os-release
if [[ "$ID" != ubuntu || "$VERSION_ID" != 24.04 ]]; then
  printf '%s\n' 'This setup script supports Ubuntu 24.04 only.' >&2
  exit 1
fi

if ! command -v docker >/dev/null; then
  apt-get update
  apt-get install -y ca-certificates curl git openssl
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  printf 'Types: deb\nURIs: https://download.docker.com/linux/ubuntu\nSuites: noble\nComponents: stable\nArchitectures: %s\nSigned-By: /etc/apt/keyrings/docker.asc\n' \
    "$(dpkg --print-architecture)" > /etc/apt/sources.list.d/docker.sources
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
docker compose version
systemctl enable --now docker

if [[ "${1:-}" == --swap && "$(swapon --noheadings --show=NAME | wc -l)" -eq 0 ]]; then
  file=/var/swap.roorin
  if [[ -e "$file" ]]; then
    printf '%s\n' 'Existing inactive /var/swap.roorin found; inspect it before enabling swap.' >&2
    exit 1
  fi
  fallocate -l 2G "$file"
  chmod 600 "$file"
  mkswap "$file"
  swapon "$file"
  if ! grep -q '^/var/swap.roorin[[:space:]]' /etc/fstab; then
    printf '/var/swap.roorin none swap sw 0 0\n' >> /etc/fstab
  fi
fi

printf '%s\n' 'Docker is ready. Use sudo for Docker commands unless you deliberately grant Docker-group access.'
printf '%s\n' 'This script does not edit SSH, firewalls, Oracle ingress rules, or DNS.'
