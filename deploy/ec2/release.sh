#!/usr/bin/env bash
# Invoked through Systems Manager as root, using files from the reviewed commit.
set -euo pipefail
umask 077
cd /opt/afyaflow
exec 9>/var/lock/afyaflow-deploy.lock
flock -w 900 9

: "${APP_IMAGE:?APP_IMAGE required}"
: "${APP_DOMAIN:?APP_DOMAIN required}"
: "${AWS_REGION:?AWS_REGION required}"
[[ "$APP_DOMAIN" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]+$ ]] || exit 1
[[ "$APP_IMAGE" =~ ^[0-9]{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com/afyaflow-staging:[a-f0-9]{40}-[0-9]+-[0-9]+$ ]] || exit 1
registry="${APP_IMAGE%%/*}"
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$registry"

# Preserve the database password across releases. Never include this file in logs.
if [[ ! -f database.env ]]; then
  printf 'POSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 32)" > database.env
fi
set -a
source database.env
set +a
# The inference provider is pinned to Bedrock in compose.yaml, so a host-side
# provider.env can no longer select another provider. The instance role supplies
# Bedrock credentials; no API key is fetched or stored on the host.
if [[ -f provider.env ]]; then
  echo 'Ignoring /opt/afyaflow/provider.env: staging inference is pinned to Bedrock in compose.yaml.' >&2
fi
previous_image=''
if [[ -f .env ]]; then
  previous_image="$(sed -n 's/^APP_IMAGE=//p' .env)"
fi
write_env() {
  printf 'APP_IMAGE=%s\nAPP_DOMAIN=%s\nAWS_REGION=%s\nPOSTGRES_PASSWORD=%s\n' \
    "$1" "$APP_DOMAIN" "$AWS_REGION" "$POSTGRES_PASSWORD" > .env.deploy
}
write_env "$APP_IMAGE"
compose() {
  env -u APP_IMAGE -u APP_DOMAIN -u AWS_REGION -u POSTGRES_PASSWORD \
    docker compose --env-file .env.deploy --project-name afyaflow --file compose.yaml "$@"
}
compose pull
compose up -d --wait postgres

# Keep a database backup before migrations; app rollback does not undo migrations.
mkdir -p backups
backup="backups/$(date -u +%Y%m%dT%H%M%SZ).dump"
compose exec -T postgres pg_dump -U afyaflow -d afyaflow -Fc > "$backup"
chmod 600 "$backup"
compose run --rm --no-deps app node dist/src/backend/src/database/migrate.js

# Public fixture PINs are only enabled by an explicit operator request.
if [[ "${SEED_SYNTHETIC:-false}" == 'true' ]]; then
  compose run --rm --no-deps -e ALLOW_SYNTHETIC_SEED=true app node dist/src/backend/src/database/seed.js
fi

# Import only after the new API is healthy and filters historical cases out of
# operational views. An older image must never see newly imported research rows.
if ! compose up -d --wait --wait-timeout 240; then
  if [[ -n "$previous_image" ]]; then
    cp .env .env.deploy
    compose up -d --wait --wait-timeout 240
  fi
  echo 'Deployment failed. Application rollback attempted; database migrations are retained.' >&2
  exit 1
fi
# An import command can fail after committing (for example, on disconnection).
# Keep the new API after any import attempt; rolling back could expose research
# records through a legacy API that predates the source filter.
if ! compose exec -T app node dist/src/backend/src/database/import-mimic.js; then
  mv .env.deploy .env
  echo 'API is healthy, but the dataset import was not confirmed. Retry the release; the import is idempotent.' >&2
  exit 1
fi
mv .env.deploy .env
# The healthy app no longer mounts secrets/. Remove the copy of the retired OpenAI key.
rm -f secrets/openai-api-key
rmdir secrets 2>/dev/null || true

# Avoid unlimited disk growth on a small host. Keep the previous application image.
find backups -type f -name '*.dump' -mtime +7 -delete
docker image prune --force >/dev/null
while IFS= read -r stored_image; do
  if [[ "$stored_image" != "$APP_IMAGE" && "$stored_image" != "$previous_image" ]]; then
    docker image rm "$stored_image" >/dev/null || true
  fi
done < <(docker image ls "$registry/afyaflow-staging" --format '{{.Repository}}:{{.Tag}}')
echo 'Application containers are healthy. Verify HTTPS and the synthetic workflow separately.'
