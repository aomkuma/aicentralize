#!/bin/sh
set -e

echo "[BOOT] Running prisma migrations"
npx prisma migrate deploy

echo "[BOOT] Ensuring Prisma client is generated"
npx prisma generate

echo "[BOOT] Starting API"
node dist/index.js
