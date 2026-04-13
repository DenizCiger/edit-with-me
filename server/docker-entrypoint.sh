#!/bin/sh
set -eu

mkdir -p /app/data
chown -R bunapp:bunjs /app/data

exec su-exec bunapp:bunjs bun run server/ws.ts
