#!/usr/bin/env bash
set -euo pipefail
for service in auth social; do
  variable="${service^^}_DATABASE_URL"
  DATABASE_URL="${!variable:?Missing service database URL}" \
    node node_modules/prisma/build/index.js migrate deploy \
      --config="apps/backend/$service/prisma.config.ts"
done
