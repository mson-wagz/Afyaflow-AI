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
# Non-secret operator settings persist independently of CI releases.
if [[ -f provider.env ]]; then source provider.env; fi
AI_PROVIDER="${AI_PROVIDER:-bedrock}"
OPENAI_MODEL="${OPENAI_MODEL:-gpt-4.1-mini}"
[[ "$AI_PROVIDER" == bedrock || "$AI_PROVIDER" == openai ]] || exit 1
[[ "$OPENAI_MODEL" =~ ^[a-zA-Z0-9._-]+$ ]] || exit 1
install -d -m 700 -o 1000 -g 1000 secrets
if [[ "$AI_PROVIDER" == openai ]]; then
  # Fetch on the host: the key never enters SSM command history or CI logs.
  secret_tmp="$(mktemp secrets/.openai.XXXXXX)"
  trap 'rm -f "$secret_tmp"' EXIT
  aws ssm get-parameter --name "${OPENAI_KEY_PARAMETER:-/afyaflow/staging/openai-api-key}" \
    --with-decryption --query Parameter.Value --output text --region "$AWS_REGION" > "$secret_tmp"
  test -s "$secret_tmp"
  chown 1000:1000 "$secret_tmp"
  chmod 400 "$secret_tmp"
  mv "$secret_tmp" secrets/openai-api-key
  trap - EXIT
fi
previous_image=''
if [[ -f .env ]]; then
  previous_image="$(sed -n 's/^APP_IMAGE=//p' .env)"
fi
write_env() {
  printf 'APP_IMAGE=%s\nAPP_DOMAIN=%s\nAWS_REGION=%s\nPOSTGRES_PASSWORD=%s\nAI_PROVIDER=%s\nOPENAI_MODEL=%s\n' \
    "$1" "$APP_DOMAIN" "$AWS_REGION" "$POSTGRES_PASSWORD" "$AI_PROVIDER" "$OPENAI_MODEL" > .env.deploy
}
write_env "$APP_IMAGE"
compose() {
  env -u APP_IMAGE -u APP_DOMAIN -u AWS_REGION -u POSTGRES_PASSWORD -u AI_PROVIDER -u OPENAI_MODEL \
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
compose run --rm --no-deps app node dist/src/backend/src/database/import-mimic.js

# Public fixture PINs are only enabled by an explicit operator request.
if [[ "${SEED_SYNTHETIC:-false}" == 'true' ]]; then
  compose run --rm --no-deps -e ALLOW_SYNTHETIC_SEED=true app node dist/src/backend/src/database/seed.js
fi

if ! compose up -d --wait --wait-timeout 240; then
  if [[ -n "$previous_image" ]]; then
    cp .env .env.deploy
    compose up -d --wait --wait-timeout 240
  fi
  echo 'Deployment failed. Application rollback attempted; database migrations are retained.' >&2
  exit 1
fi
mv .env.deploy .env

# Avoid unlimited disk growth on a small host. Keep the previous application image.
find backups -type f -name '*.dump' -mtime +7 -delete
docker image prune --force >/dev/null
while IFS= read -r stored_image; do
  if [[ "$stored_image" != "$APP_IMAGE" && "$stored_image" != "$previous_image" ]]; then
    docker image rm "$stored_image" >/dev/null || true
  fi
done < <(docker image ls "$registry/afyaflow-staging" --format '{{.Repository}}:{{.Tag}}')
echo 'Application containers are healthy. Verify HTTPS and the synthetic workflow separately.'
