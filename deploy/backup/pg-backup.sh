#!/usr/bin/env bash
# Nightly encrypted database dump, copied off the VPS. Schedule with cron, e.g.
#   15 2 * * *  /opt/abcfinance/deploy/backup/pg-backup.sh >> /var/log/abcfinance-backup.log 2>&1
# Needs: BACKUP_PASSPHRASE_FILE (gpg symmetric passphrase) and BACKUP_REMOTE (an rclone remote
# in India, e.g. "offsite:abcfinance-backups"). Keep APP_SECRET backed up separately.
set -euo pipefail

compose="docker compose -f /opt/abcfinance/deploy/docker-compose.yml --env-file /etc/abcfinance/app.env"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="/var/backups/abcfinance/abcfinance-$stamp.sql.gz.gpg"
mkdir -p /var/backups/abcfinance

$compose exec -T db pg_dump -U abcfinance --format=custom abcfinance \
  | gzip \
  | gpg --batch --symmetric --cipher-algo AES256 --passphrase-file "${BACKUP_PASSPHRASE_FILE:?}" -o "$out"

rclone copy "$out" "${BACKUP_REMOTE:?}"
find /var/backups/abcfinance -name 'abcfinance-*.gpg' -mtime +7 -delete
echo "$(date -u) backup ok: $out"
