# 20 - VPS Deployment

## Stack and boundaries

`compose.production.yaml` runs Next.js standalone, auth, social, Postgres 16,
and Caddy. Only Caddy publishes ports (TCP 80 and 443). Postgres and auth gRPC
remain private. Each API connects as its own non-superuser database owner, not
the bootstrap/backup administrator. `www` redirects to the canonical apex domain so sessions use one
host. The proxy rewrites `/api/auth/graphql` and `/api/social/graphql` to the
respective service's `/graphql`; all other application paths go to Next.

The production Compose project has separate volumes from development. Database
data and Caddy certificates survive `down`. Never run `down -v` unless deliberately
destroying production. Docker restart policies restart the services after reboot.
Docker health checks report failures but do not themselves restart an unhealthy
process that is still running; inspect logs and resolve its cause.

Use Node 24 images and native platform builds: Linux amd64 for x86_64 VPSs or
Linux arm64 for aarch64. Host Node/npm/protoc are not required; the images contain
their build/runtime tools. Ubuntu needs Docker Engine with the Compose plugin,
Git, Bash, and OpenSSL. Install Docker from its
[official Ubuntu instructions](https://docs.docker.com/engine/install/ubuntu/).
Do not expose Docker's API or install a public Docker administration dashboard.

## DNS and Oracle networking

In the authoritative DNS zone:

| Type  | Name  | Value        |
| ----- | ----- | ------------ |
| A     | `@`   | `VPS_IP`     |
| CNAME | `www` | `roorin.com` |

Replace the old apex A record, not the mail/MX/TXT records. Remove conflicting
apex/web records, including AAAA only if no IPv6 address is configured on the
VPS. If restrictive CAA records exist, ensure they permit Caddy's certificate
issuer. Keep Hostinger nameservers; a different hosting provider does not
require moving DNS.

Confirm DNS resolves to the VPS before expecting public HTTPS to work:

```bash
dig +short roorin.com A
dig +short www.roorin.com A
```

In Oracle Cloud, open the instance's VNIC/subnet configuration and the attached
NSG or security list. Add stateful ingress TCP rules for destination ports 80
and 443 from `0.0.0.0/0`; source ports are unrestricted. Keep SSH port 22
restricted to your administration IP where practical. Do not open 3000, 3001,
4200, 5050, or 5432. Both the Oracle network rules and host firewall must permit
web traffic. See [Oracle security lists](https://docs.oracle.com/en-us/iaas/Content/Network/Concepts/securitylists.htm)
and [host firewall guidance](https://docs.oracle.com/en-us/iaas/Content/Security/Reference/compute_security.htm).

Inspect the host firewall with `sudo iptables -S` and `sudo ufw status` before
editing it. Oracle Ubuntu images may have an explicit INPUT reject rule despite
inactive UFW. Do not flush rules or disable the firewall. Docker's published
ports traverse its forwarding/NAT chains rather than necessarily UFW's INPUT
rules; retain Oracle ingress restrictions and inspect Docker firewall rules too.

Caddy obtains and renews HTTPS certificates automatically after DNS and ports
are correct. Preserve its `/data` volume. Do not use plain HTTP as an auth
workaround: production cookies intentionally require HTTPS. See
[Caddy HTTPS](https://caddyserver.com/docs/quick-starts/https).

## Configuration and secrets

Run from the repository root:

```bash
bash scripts/production.sh init
```

This creates the gitignored `deploy/.env.production` with mode 600, a random
hexadecimal administrator/auth/social database passwords and JWT signing secret, `DOMAIN=roorin.com`,
`IMAGE_TAG=local`, and a seven-day absolute session lifetime. `init` refuses
to overwrite existing values. Keep this file stable across deploys and store
an encrypted off-server copy. Changing the JWT secret signs users out; changing
the password in the file does not change an existing Postgres role's password.
Password rotation requires a deliberate matching database change.

Production uses injected environment variables and ignores backend local `.env`
files. `.dockerignore` excludes local env files, secrets, backups, and builds.
Do not copy development `.env` files to the server. Auth's development `.env`
is historically tracked: `.gitignore` does not remove it from Git's index.
Before publishing, remove it from tracking while preserving the local file:

```bash
git rm --cached apps/backend/auth/.env
```

That command explicitly stages a deletion; review/commit it yourself. Rotate
any real secrets previously committed. Removing a file does not erase history.
New production credentials must never appear in Git or chat.

Build-time web URLs are `https://DOMAIN/api/auth/graphql` and
`https://DOMAIN/api/social/graphql`. Next's `NEXT_PUBLIC_*` values are public
and baked into JavaScript; changing `DOMAIN` requires rebuilding images.
The image contains no JWT/database secret. Auth/social use `NODE_ENV=production`,
strict HTTPS CORS origins, private database URLs, and secure httpOnly cookies.
GraphQL Playground, introspection, and error stack traces are disabled in
production. Web codegen uses committed schema snapshots, not production
introspection.

Caddy's static private IP is `172.30.0.2`; dynamic container addresses are
allocated from `172.30.0.128/25` so they cannot take the proxy's reserved IP.
Only the proxy IP is trusted for forwarded
client addresses. Do not use `TRUST_PROXY=true`, a hop count, or an internet-wide
CIDR. The `172.30.0.0/24` subnet must not conflict with host/VPN/container routes.
If changed, update both proxy IP and backend trust settings. Direct backend
ports are not published. Rate limiting remains process-local and suitable for
one auth instance; horizontal scaling needs a shared rate-limit store.

## Build and transfer for a small VPS

After reviewing and committing deployment files, push them to GitHub. On the
laptop (Docker must be running), build for the VPS architecture:

```bash
bash scripts/production.sh init
DOCKER_DEFAULT_PLATFORM=linux/amd64 bash scripts/production.sh build
bash scripts/production.sh export
scp .local-backups/production-images.tar.gz ubuntu@129.152.17.41:~/
```

Images are `roorin-backend`, `roorin-web`, and `roorin-migrate`, with the
configured tag. Exported images contain code/tools, not production secrets.
Use a unique tag per release instead of reusing `local` for managed releases.
Building natively on a larger VPS is also supported, but is not recommended on
this 1 GB instance. Apple Silicon needs Linux amd64 emulation for this VPS.

On the VPS, clone the repository after the deployment commit is available:

```bash
git clone `YOUR_GITHUB_PROJECT` roorin
cd roorin
sudo bash deploy/prepare-ubuntu.sh --swap
bash scripts/production.sh init
sudo docker image load -i ~/production-images.tar.gz
sudo bash scripts/production.sh up
sudo bash scripts/production.sh status
```

A private repository requires GitHub authentication. Use a read-only deploy
key or authenticated Git credential; never embed a token in the clone URL.
`prepare-ubuntu.sh` is optional and supports Ubuntu 24.04. It installs Docker
from Docker's signed apt repository when Docker is absent, enables its service,
and optionally creates 2 GB swap when no swap is active. It does not edit SSH,
DNS, host firewall rules, or Oracle security lists. Review it before running
with sudo. An existing Docker installation is retained and checked for Compose.

If Docker requires root, configure the user's access or use `sudo bash` for
Docker commands consistently. Membership in the Docker group is effectively
root access. Do not run `npm start` or `npm run db:setup` on the server.

`up` waits for Postgres, saves dumps of both databases, applies committed Prisma
migrations sequentially, then starts the application and proxy without building.
Failed backups/migrations abort startup. Existing applications are not forcibly
stopped before migration, so release migrations must be backward-compatible.
No reset, fixture seed, or known-password demo accounts run in production.
Initial databases are empty; register an account and create communities normally.

## Verification and operations

```bash
curl -I https://roorin.com
curl https://roorin.com/healthz
curl https://roorin.com/api/social/graphql \
  -H 'content-type: application/json' \
  --data '{"query":"{ __typename }"}'
bash scripts/production.sh logs
docker stats --no-stream
```

The proxy `/healthz` checks the proxy, not the database/application. Compose
separately checks web and API responses and waits for healthy dependencies.
Check real registration/login, reload session restoration, creating/joining a
community, posting, comments, and voting before calling the deployment ready.
Auth/social health checks require no private data or schema introspection.

Manual updates:

1. Review/test changes and build/export images for the new release.
2. Transfer/load those images and pull the matching Git commit on the VPS.
3. Set the matching `IMAGE_TAG` and run `bash scripts/production.sh up`.
4. Check health, logs, and a real login/write workflow.

Keep the previous images available. Reverting the image/tag does not reverse
database migrations; inspect schema compatibility first. This setup is not
zero-downtime deployment. GitHub Actions can later build/publish images and call
the same migration/start sequence; no auto-deploy workflow is enabled here.

```bash
bash scripts/production.sh backup
bash scripts/production.sh down
```

Backups are timestamped custom-format `pg_dump` files in
`.local-backups/production-*`. Auth contains password hashes and personal data;
restrict access and copy backups to encrypted off-server storage. Local backups
alone do not protect against losing the VPS. Schedule backups, define retention,
and test restores into separate databases before relying on them. For a
cross-service recovery snapshot with no concurrent writes, stop auth/social
during both dumps, then restart them; ordinary online dumps are independently
consistent but not a distributed transaction across the two services.

Run `npm audit` and inspect advisories before public release. Dependency fixes
must be tested, not blindly forced across major versions. Remaining tooling-only
advisories still require review; the migration image has no published ports and
is only started for migration. Production migrations never use `migrate dev`,
`db push`, reset, or seed commands.

Root `overrides` patch pinned GraphQL utilities, Prisma configuration utilities,
and transitive SQL/query parsers. Test generation, migration, and API contracts
when changing them. The backend runtime installs production dependencies without
optional tooling peers, then copies the generated service-specific Prisma
clients. Next's runtime contains only its traced standalone dependencies; the
larger migration image retains build tools but does not serve public traffic.
Use `npm audit --omit=dev` to check the production dependency graph separately
from the full development toolchain. Neither a clean audit nor this deployment
setup replaces abuse controls, monitoring, tested off-server backups, or security
review; moderation and account recovery remain application limitations.
