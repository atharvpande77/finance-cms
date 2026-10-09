#!/usr/bin/env bash
# Issues a TLS certificate for a newspaper's finance host and reloads nginx.
# Run on the VPS after the newspaper's CNAME points at us and the tenant row lists the host.
#   sudo deploy/add-tenant-host.sh money.example-paper.com
set -euo pipefail

host="${1:?usage: add-tenant-host.sh <finance host>}"
if [[ ! "$host" =~ ^[a-z0-9.-]+\.[a-z]{2,}$ ]]; then
  echo "Not a valid host name: $host" >&2
  exit 1
fi

echo "Checking DNS for $host..."
getent hosts "$host" || { echo "$host does not resolve yet; check the CNAME." >&2; exit 1; }

mkdir -p /var/www/acme
certbot certonly --webroot -w /var/www/acme -d "$host" --non-interactive --agree-tos \
  --email "${CERTBOT_EMAIL:?set CERTBOT_EMAIL}" --keep-until-expiring
nginx -t
systemctl reload nginx
echo "HTTPS ready for $host. Renewals are handled by certbot's timer."
