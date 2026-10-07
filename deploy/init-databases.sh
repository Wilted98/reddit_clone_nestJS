#!/bin/bash
set -euo pipefail
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
  \getenv auth_password AUTH_DATABASE_PASSWORD
  \getenv social_password SOCIAL_DATABASE_PASSWORD
  CREATE ROLE roorin_auth LOGIN PASSWORD :'auth_password';
  CREATE ROLE roorin_social LOGIN PASSWORD :'social_password';
  ALTER DATABASE roorin_auth OWNER TO roorin_auth;
  REVOKE ALL ON DATABASE roorin_auth FROM PUBLIC;
  CREATE DATABASE roorin_social OWNER roorin_social;
  REVOKE ALL ON DATABASE roorin_social FROM PUBLIC;
SQL
