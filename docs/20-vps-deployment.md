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

## Deployment values

All public hostnames, SSH connection details, image names, and deployment paths
are operator-configured. `example.com`, `YOUR_VPS_HOST`, `YOUR_SSH_USER`, and
`YOUR_REPOSITORY_URL` below are placeholders, not deployment defaults.

For laptop commands, replace these values with your own:

```bash
export DOMAIN=example.com
export VPS_HOST=YOUR_VPS_HOST
export VPS_USER=YOUR_SSH_USER
export VPS_PORT=22
```

`DOMAIN` must be a real DNS domain you control. `VPS_HOST` accepts an IPv4 address
or SSH hostname. Image prefixes are lowercase names such as `my-app`; the
deployment directory is an absolute path owned by your SSH user. SSH port 22 is
the only connection default; the hostname, user, and directory are required.

## DNS and firewall

In the authoritative DNS zone:

| Type  | Name  | Value         |
| ----- | ----- | ------------- |
| A     | `@`   | `VPS_IP`      |
| CNAME | `www` | `YOUR_DOMAIN` |

Replace the old apex A record, not the mail/MX/TXT records. Remove conflicting
apex/web records, including AAAA only if no IPv6 address is configured on the
VPS. If restrictive CAA records exist, ensure they permit Caddy's certificate
issuer. Keep your DNS provider's nameservers; a different hosting provider does not
require moving DNS.

Confirm DNS resolves to the VPS before expecting public HTTPS to work:

```bash
dig +short "$DOMAIN" A
dig +short "www.$DOMAIN" A
```

For Oracle Cloud, open the instance's VNIC/subnet configuration and the attached
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
DOMAIN=example.com IMAGE_PREFIX=my-app COMPOSE_PROJECT_NAME=my-app-production \
  bash scripts/production.sh init
```

This creates the gitignored `deploy/.env.production` with mode 600, a random
hexadecimal administrator/auth/social database passwords and JWT signing secret,
your selected domain/image prefix/Compose project, `IMAGE_TAG=local`, and a
seven-day absolute session lifetime. Fresh initialization requires `DOMAIN`;
the optional prefix defaults to `app` and project to `PREFIX-production`.
`init` refuses to overwrite existing values. Keep this file stable across deploys and store
an encrypted off-server copy. Changing the JWT secret signs users out; changing
the password in the file does not change an existing Postgres role's password.
Password rotation requires a deliberate matching database change.

`IMAGE_PREFIX` selects `PREFIX-backend`, `PREFIX-web`, and `PREFIX-migrate`.
`COMPOSE_PROJECT_NAME` identifies the deployment's Docker containers, networks,
and volumes. Choose it once for a fresh installation and keep it stable.
Database names and roles are internal application identifiers, not the public
site name; they are intentionally unchanged to preserve existing databases.

**Existing installations:** add `IMAGE_PREFIX` and `COMPOSE_PROJECT_NAME` to
the existing private configuration before using the updated scripts. Do not
regenerate secrets. Keep the prefix used by the existing manual images and
obtain the current Compose project name from your database container:

```bash
sudo docker ps --filter label=com.docker.compose.service=postgres --format '{{.ID}} {{.Names}}'
sudo docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' YOUR_DATABASE_CONTAINER
```

Set `COMPOSE_PROJECT_NAME` to that exact value. Renaming an installed project
selects different volumes and can appear to create an empty database. Missing
project configuration is refused rather than silently selecting new storage.

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
DOMAIN="$DOMAIN" IMAGE_PREFIX=my-app COMPOSE_PROJECT_NAME=my-app-production \
  bash scripts/production.sh init
DOCKER_DEFAULT_PLATFORM=linux/amd64 bash scripts/production.sh build
bash scripts/production.sh export
scp -P "$VPS_PORT" .local-backups/production-images.tar.gz "$VPS_USER@$VPS_HOST:~/"
```

Images are `PREFIX-backend`, `PREFIX-web`, and `PREFIX-migrate`, with the
configured tag. Exported images contain code/tools, not production secrets.
Use a unique tag per release instead of reusing `local` for managed releases.
Building natively on a larger VPS is also supported, but is not recommended on
low-memory servers. Apple Silicon needs emulation when building for an x86_64 VPS.

On the VPS, clone the repository after the deployment commit is available:

```bash
git clone YOUR_REPOSITORY_URL project
cd project
sudo bash deploy/prepare-ubuntu.sh --swap
DOMAIN=example.com IMAGE_PREFIX=my-app COMPOSE_PROJECT_NAME=my-app-production \
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
No reset, fixture seed, or known-password demo accounts run automatically in production.
Initial databases are empty; register an account and create communities normally.

## Verification and operations

```bash
curl -I "https://$DOMAIN"
curl "https://$DOMAIN/healthz"
curl "https://$DOMAIN/api/social/graphql" \
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
zero-downtime deployment. The GitHub Actions setup below automates the same
migration/start sequence without building on the VPS.

## Automatic deployment with GitHub Actions

`.github/workflows/deploy-production.yml` runs on pushes/merges to `main` and
can be run manually from Actions on `main`. It tests the application and scripts,
lints the apps, builds Linux amd64 images on GitHub, and transfers a checksummed
release over SSH. No container registry or VPS GitHub credential is required.
Actions are pinned to commit SHAs; update these pins deliberately.

The build uses committed schema snapshots and a non-secret placeholder database
URL for generation. Production database/JWT secrets stay on the VPS. Set
`PRODUCTION_DOMAIN` and `IMAGE_PREFIX` as **repository** variables, not only
environment variables, so build and deployment use the same values.
Both are required; neither has a site-specific
fallback. The prefix must match the VPS's private configuration.

### One-time VPS configuration

On the VPS, choose your checkout and deployment directories. Run as the SSH
user who owns those directories:

```bash
export CHECKOUT_DIR="$HOME/project"
export VPS_DEPLOY_PATH="$HOME/app-deploy"
install -d -m 700 "$VPS_DEPLOY_PATH"
install -m 600 "$CHECKOUT_DIR/deploy/.env.production" "$VPS_DEPLOY_PATH/.env.production"
sudo -n docker version
```

Do this once: keep the existing secret values, never generate new ones for an
update. The copied configuration is the source of truth for automated releases.
Do not overwrite it later with an older copy. `sudo -n` must work without a
password for deployment's Docker and production-script commands. The selected
SSH account must already have the appropriate administration access; do not loosen
sudo permissions for unrelated accounts to work around a failure.

The configured, stable Compose project name reuses the existing database and
certificate volumes. Do **not** shut down the current installation or delete volumes before
the first automated deployment. Afterward, operate through `$VPS_DEPLOY_PATH/current`,
not the old Git checkout, to avoid accidentally starting the old `local` images.

### Dedicated SSH credentials

On your laptop, generate a separate Actions key (outside the repository):

```bash
ssh-keygen -t ed25519 -C production-actions -f ~/.ssh/production_actions -N ''
ssh-copy-id -p "$VPS_PORT" -i ~/.ssh/production_actions.pub "$VPS_USER@$VPS_HOST"
ssh -p "$VPS_PORT" -i ~/.ssh/production_actions -o IdentitiesOnly=yes "$VPS_USER@$VPS_HOST" 'sudo -n docker version'
```

Do not overwrite an existing key. Use this dedicated key, not your personal
SSH key. Its private half belongs only in GitHub's encrypted secret store;
never commit it. Optionally prefix its `authorized_keys` entry with `restrict`
to disable forwarding and PTY access while retaining command/SFTP access.
This key can deploy code with Docker/root privileges: protect `main`, review
workflow changes, and revoke the key if exposed.

Obtain the server host key over your **already trusted** SSH connection:

```bash
host_key="$(ssh -p "$VPS_PORT" "$VPS_USER@$VPS_HOST" 'cat /etc/ssh/ssh_host_ed25519_key.pub')"
host_label="$VPS_HOST"
if [ "$VPS_PORT" != 22 ]; then
  host_label="[$VPS_HOST]:$VPS_PORT"
fi
printf '%s %s\n' "$host_label" "$host_key"
```

Use that complete line as `VPS_SSH_KNOWN_HOSTS`. For a non-default port use
`[HOST]:PORT` instead of `HOST` at the beginning. Do not use an unverified
`ssh-keyscan` result or disable host-key verification.

### GitHub settings

In repository **Settings > Environments**, create `production` and allow only
`main` to deploy. Add these **environment secrets**:

| Secret                | Value                                                                         |
| --------------------- | ----------------------------------------------------------------------------- |
| `VPS_SSH_PRIVATE_KEY` | Entire contents of `~/.ssh/production_actions`, including the BEGIN/END lines |
| `VPS_SSH_KNOWN_HOSTS` | Verified server host-key line from the command above                          |

In **Settings > Secrets and variables > Actions > Variables**, configure:

| Repository variable | Value                                                     |
| ------------------- | --------------------------------------------------------- |
| `VPS_HOST`          | Your VPS IP address or SSH hostname (required)            |
| `VPS_USER`          | Your SSH username (required)                              |
| `VPS_PORT`          | Your SSH port; defaults to `22`                           |
| `VPS_DEPLOY_PATH`   | Your absolute VPS deployment directory (required)         |
| `PRODUCTION_DOMAIN` | Your public DNS domain, matching VPS `DOMAIN` (required)  |
| `IMAGE_PREFIX`      | Your image prefix, matching VPS `IMAGE_PREFIX` (required) |

GitHub-hosted runners must be able to reach SSH through Oracle's NSG/security
list and the host firewall. Their outbound IPs vary; a rule allowing only your
laptop's IP will block Actions. Do not open database/API ports. If SSH must stay
restricted to a fixed administration IP, use a separately managed runner with
static egress or a private-network deployment connection. See
[GitHub deployment controls and runner networking](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments).

Merge the workflow into `main` after configuring these settings. The Actions
tab shows test/build/transfer/deploy progress. Required environment reviewers
are optional; enabling them adds a manual approval before each deployment.
Private repositories may have Actions minute/storage limits; release artifacts
are approximately 1 GB and expire after one day. Builds use Docker's
[GitHub Actions cache](https://docs.docker.com/build/ci/github-actions/cache/).

### Release behavior and recovery

Each release has SHA-tagged images and its matching Compose/scripts under
`releases/SHA-RUN_ID-ATTEMPT`. A private shared `.env.production` preserves
session signing and database credentials. Per-release `deploy/.image-tag` and
`deploy/.image-prefix` select images without editing that secret file. Builds for
another domain, image prefix, or
architecture are refused before migrations. A VPS lock prevents overlapping
release scripts; workflow concurrency does not cancel an active migration.
Superseded builds are skipped when `main` has advanced before deployment.

Deployment loads prebuilt images, backs up both databases, applies committed
migrations, waits for healthy containers, and verifies public HTTPS/API routes.
It never resets or seeds data. Existing manually seeded data is retained.
`current` switches after Compose reports healthy services; `previous` retains
the former automated release. Public HTTPS checks happen afterward, so a failed
external check can leave the new healthy release active: inspect the Actions
failure before retrying. Do not cancel an in-progress migration manually.

```bash
cd "$VPS_DEPLOY_PATH/current"
sudo bash scripts/production.sh status
sudo bash scripts/production.sh logs
sudo bash scripts/production.sh backup
```

Backups remain under `$VPS_DEPLOY_PATH/backups`. Successful uploads
discard their compressed image/source archives. Old tracked image tags are
removed only after a successful update, retaining current/previous tags and
the original manual `local` images. No global Docker pruning or volume deletion
runs. Failed uploads/releases and backups require periodic private cleanup;
monitor disk usage and copy backups off-server.

A migration/startup failure stops the workflow and leaves the `current` link
unchanged, but Docker may already have recreated some services. This is not a
transactional or zero-downtime rollout. Migrations are not automatically reversed,
and image rollback is not automatic. If the previous release is schema-compatible:

```bash
cd "$VPS_DEPLOY_PATH/previous"
sudo bash scripts/production.sh up
```

This starts the previous image set but does not reverse migrations or change
the `current` link. Check health and correct that link deliberately, or deploy
a reviewed revert commit through `main`. The first automated release has no
`previous` link; its fallback is the original checkout and `local` images.

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
