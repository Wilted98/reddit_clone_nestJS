#!/bin/bash
# Simple script. It runs once, on first boot of the postgres container.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE DATABASE roorin_social;
  CREATE DATABASE roorin;
EOSQL

echo "✅ Created databases: roorin_auth (default), roorin_social"
