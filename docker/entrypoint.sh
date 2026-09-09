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

# Seed:
# - SEED_ON_START=true  → zawsze (idempotentny upsert)
# - SEED_ON_START=false → nigdy
# - domyślnie / auto    → tylko gdy brak grup
should_seed="false"
if [ "${SEED_ON_START}" = "true" ]; then
  should_seed="true"
elif [ "${SEED_ON_START}" = "false" ]; then
  should_seed="false"
else
  GROUP_COUNT="$(npx tsx -e "import { PrismaClient } from '@prisma/client'; const p=new PrismaClient(); p.ticketGroup.count().then(c=>{console.log(c); return p.\$disconnect();}).catch(async e=>{console.error(e); await p.\$disconnect(); process.exit(1);})")"
  echo "Ticket groups in DB: ${GROUP_COUNT}"
  if [ "${GROUP_COUNT}" = "0" ]; then
    should_seed="true"
  fi
fi

if [ "${should_seed}" = "true" ]; then
  echo "Seeding default groups + agents..."
  npx tsx prisma/seed.ts
else
  echo "Skipping seed (groups already present or SEED_ON_START=false)."
fi

echo "Starting server on port ${PORT:-3000}..."
exec node dist/index.js
