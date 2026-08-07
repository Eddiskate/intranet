#!/bin/sh
set -e

DATA_DIR="${DATA_DIR:-/data}"
mkdir -p "$DATA_DIR/uploads"

export UPLOADS_DIR="${UPLOADS_DIR:-${DATA_DIR}/uploads}"

# EasyPanel często podaje MONGO_URL — mapujemy na DATABASE_URL dla Prisma
if [ -z "$DATABASE_URL" ] && [ -n "$MONGO_URL" ]; then
  export DATABASE_URL="$MONGO_URL"
fi

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL or MONGO_URL is required (MongoDB connection string)."
  exit 1
fi

# Log hosta bez credentials (łatwiejszy debug auth)
DB_HOST="$(printf '%s' "$DATABASE_URL" | sed -E 's#^[a-zA-Z0-9+.-]+://([^/]+@)?##' | cut -d/ -f1)"
echo "Mongo target: ${DB_HOST:-unknown}"

echo "Syncing MongoDB schema (prisma db push)..."
npx prisma db push --skip-generate

if [ "${SEED_ON_START}" = "true" ]; then
  echo "Seeding database..."
  npx tsx prisma/seed.ts
fi

echo "Starting server on port ${PORT:-3000}..."
exec node dist/index.js
