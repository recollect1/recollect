#!/bin/bash
# Runs on the EC2 host (Amazon Linux 2023, arm64) as root, through SSM Run Command.
#   bootstrap.sh <git-ref> <site-host>
# Idempotent: safe to run again to deploy a newer commit.
set -euo pipefail
REF="${1:-main}"
SITE_HOST="$2"
REPO=https://github.com/recollect1/recollect.git
DIR=/opt/recollect
export AWS_REGION=us-east-1

# Docker, Compose and swap (the image builds need more than 2 GB of memory).
if ! command -v docker >/dev/null; then
  dnf install -y docker git
  systemctl enable --now docker
fi
if [ ! -x /usr/local/lib/docker/cli-plugins/docker-compose ]; then
  mkdir -p /usr/local/lib/docker/cli-plugins
  curl -fsSL -o /usr/local/lib/docker/cli-plugins/docker-compose \
    https://github.com/docker/compose/releases/latest/download/docker-compose-linux-aarch64
  chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
fi
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Code at the requested ref.
if [ ! -d "$DIR/.git" ]; then git clone "$REPO" "$DIR"; fi
cd "$DIR"
git fetch --all --quiet && git checkout --quiet "$REF" && git pull --quiet --ff-only origin "$REF" || true

# Secrets: one SecureString of KEY=VALUE lines. Never written to the repo or the logs.
aws ssm get-parameter --name /recollect/env --with-decryption --query Parameter.Value --output text \
  > deploy/aws/.env
echo "SITE_HOST=$SITE_HOST" >> deploy/aws/.env
chmod 600 deploy/aws/.env

# Build one image at a time (memory), then start.
docker build -q -f deploy/mcp-server.Dockerfile -t recollect-mcp .
docker build -q -f deploy/web.Dockerfile -t recollect-web .
docker build -q -f deploy/worker.Dockerfile -t recollect-worker .
cd deploy/aws
docker compose --env-file .env -p recollect up -d --remove-orphans
docker compose -p recollect ps
