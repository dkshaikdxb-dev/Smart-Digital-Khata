#!/usr/bin/env bash
# =========================================================================
# Provision Let's Encrypt SSL via Certbot (standalone).
# Usage:
#   ./scripts/setup-ssl.sh yourdomain.com you@example.com
# =========================================================================
set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"
if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
  echo "Usage: $0 <domain> <email>"
  exit 1
fi

if ! command -v certbot >/dev/null 2>&1; then
  echo "Installing certbot..."
  apt-get update -y && apt-get install -y certbot
fi

# Stop nginx briefly so certbot can bind :80
docker compose stop nginx || true

certbot certonly --standalone --non-interactive --agree-tos \
  -m "$EMAIL" -d "$DOMAIN"

mkdir -p docker/certs/"$DOMAIN"
cp -L /etc/letsencrypt/live/"$DOMAIN"/fullchain.pem docker/certs/"$DOMAIN"/fullchain.pem
cp -L /etc/letsencrypt/live/"$DOMAIN"/privkey.pem   docker/certs/"$DOMAIN"/privkey.pem

echo "Certificates placed in docker/certs/$DOMAIN."
echo "Edit docker/nginx.conf to enable the HTTPS server block, then:"
echo "  docker compose up -d nginx"
