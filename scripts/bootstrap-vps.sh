#!/usr/bin/env bash
# =========================================================================
# Smart Digital Khata — VPS bootstrap
#
# One-shot bootstrap for a fresh Ubuntu 22.04 / Debian 12 VPS.
# Usage (as root or with sudo):
#   curl -fsSL https://raw.githubusercontent.com/dkshaikdxb-dev/smart-digital-khata/main/scripts/bootstrap-vps.sh | bash
#
# What it does:
#   1. Updates apt
#   2. Installs Docker, Docker Compose plugin, git, ufw, curl
#   3. Configures firewall (22, 80, 443)
#   4. Clones the repo to /opt/smart-digital-khata
#   5. Prompts you to configure .env and run ./scripts/deploy.sh
# =========================================================================
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/dkshaikdxb-dev/smart-digital-khata.git}"
APP_DIR="${APP_DIR:-/opt/smart-digital-khata}"

log() { printf "\033[1;32m==>\033[0m %s\n" "$*"; }

if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (or: sudo bash bootstrap-vps.sh)"
  exit 1
fi

log "Updating apt..."
apt-get update -y

log "Installing base packages..."
apt-get install -y ca-certificates curl git ufw gnupg lsb-release

# ---- Docker -------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker Engine..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release; echo "${VERSION_CODENAME}") stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
else
  log "Docker already installed"
fi

# ---- Firewall -----------------------------------------------------------
log "Configuring UFW firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw --force enable

# ---- Clone repo ---------------------------------------------------------
if [ ! -d "$APP_DIR/.git" ]; then
  log "Cloning repo to $APP_DIR..."
  mkdir -p "$(dirname "$APP_DIR")"
  git clone "$REPO_URL" "$APP_DIR"
else
  log "Repo already present at $APP_DIR — pulling"
  (cd "$APP_DIR" && git pull --ff-only || true)
fi

cd "$APP_DIR"
if [ ! -f .env ]; then
  cp .env.example .env
  log "Created .env from .env.example — please edit it now:"
  log "  nano $APP_DIR/.env"
  log "Then run: ./scripts/deploy.sh"
else
  log ".env already exists — skipping"
fi

log "Bootstrap complete. Next: edit $APP_DIR/.env, then run ./scripts/deploy.sh"
