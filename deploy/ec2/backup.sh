#!/usr/bin/env bash
# Off-host database backups for the EC2 deployment, run as root from /opt/afyaflow.
#   backup.sh backup         dump PostgreSQL and upload it, encrypted, to the S3 backup bucket
#   backup.sh restore-test   restore the newest S3 backup into a scratch database, check it, drop it
# release.sh installs a daily systemd timer for `backup` and writes backup.env.
set -euo pipefail
umask 077
cd /opt/afyaflow
# shellcheck source=/dev/null
source backup.env   # BACKUP_BUCKET, AWS_REGION
: "${BACKUP_BUCKET:?BACKUP_BUCKET required}"
: "${AWS_REGION:?AWS_REGION required}"
compose() { docker compose --env-file .env --project-name afyaflow --file compose.yaml "$@"; }
psql_admin() { compose exec -T postgres psql -U afyaflow -v ON_ERROR_STOP=1 -At "$@"; }
work="$(mktemp -d /opt/afyaflow/backups/offsite.XXXXXX)"
trap 'rm -rf "$work"' EXIT

case "${1:-}" in
  backup)
    key="database/afyaflow-$(date -u +%Y%m%dT%H%M%SZ).dump"
    compose exec -T postgres pg_dump -U afyaflow -d afyaflow -Fc > "$work/db.dump"
    test -s "$work/db.dump"
    aws s3 cp "$work/db.dump" "s3://$BACKUP_BUCKET/$key" --sse AES256 --region "$AWS_REGION" --only-show-errors
    echo "Backed up to s3://$BACKUP_BUCKET/$key ($(stat -c %s "$work/db.dump") bytes)"
    ;;
  restore-test)
    key="$(aws s3api list-objects-v2 --bucket "$BACKUP_BUCKET" --prefix database/ --region "$AWS_REGION" \
      --query 'sort_by(Contents,&LastModified)[-1].Key' --output text)"
    [[ -n "$key" && "$key" != None ]] || { echo 'No backups found in the bucket.' >&2; exit 1; }
    aws s3 cp "s3://$BACKUP_BUCKET/$key" "$work/db.dump" --region "$AWS_REGION" --only-show-errors
    check=afyaflow_restore_check
    psql_admin -d postgres -c "DROP DATABASE IF EXISTS $check" -c "CREATE DATABASE $check" >/dev/null
    trap 'psql_admin -d postgres -c "DROP DATABASE IF EXISTS $check" >/dev/null || true; rm -rf "$work"' EXIT
    compose exec -T postgres pg_restore -U afyaflow -d "$check" --no-owner --exit-on-error < "$work/db.dump"
    counts="$(psql_admin -d "$check" -c "SELECT (SELECT max(version) FROM schema_migrations)||' migrations, '||
      (SELECT count(*) FROM staff)||' staff, '||(SELECT count(*) FROM visits)||' visits, '||
      (SELECT count(*) FROM audit_events)||' audit events'")"
    staff="$(psql_admin -d "$check" -c 'SELECT count(*) FROM staff')"
    [[ "$staff" =~ ^[0-9]+$ && "$staff" -gt 0 ]] || { echo "Restore check failed: $counts" >&2; exit 1; }
    echo "Restore test passed for $key: $counts"
    ;;
  *)
    echo 'Usage: backup.sh backup | restore-test' >&2; exit 2 ;;
esac
