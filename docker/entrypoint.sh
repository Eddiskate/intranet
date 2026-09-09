#!/bin/sh
set -e

DATA_DIR="${DATA_DIR:-/data}"
mkdir -p "$DATA_DIR/uploads"

export UPLOADS_DIR="${UPLOADS_DIR:-${DATA_DIR}/uploads}"

if [ -z "$DATABASE_URL" ] && [ -n "$MONGO_URL" ]; then
  export DATABASE_URL="$MONGO_URL"
fi

if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL or MONGO_URL is required (MongoDB connection string)."
  exit 1
fi

DB_HOST="$(printf '%s' "$DATABASE_URL" | sed -E 's#^[a-zA-Z0-9+.-]+://([^/]+@)?##' | cut -d/ -f1)"
echo "Mongo target: ${DB_HOST:-unknown}"

echo "Syncing MongoDB schema (prisma db push)..."
npx prisma db push --skip-generate

should_seed="false"
if [ "${SEED_ON_START}" = "true" ]; then
  should_seed="true"
elif [ "${SEED_ON_START}" = "false" ]; then
  should_seed="false"
else
  GROUP_COUNT="$(node -e "const {PrismaClient}=require('@prisma/client'); const p=new PrismaClient(); p.ticketGroup.count().then(c=>{console.log(c); return p.\$disconnect();}).catch(async e=>{console.error(e); await p.\$disconnect(); process.exit(1);})")" || GROUP_COUNT="?"
  echo "Ticket groups in DB: ${GROUP_COUNT}"
  if [ "${GROUP_COUNT}" = "0" ]; then
    should_seed="true"
  fi
fi

if [ "${should_seed}" = "true" ]; then
  echo "Seeding default groups + agents..."
  # Nie zabijaj kontenera przy P2031 (Mongo bez replica set) — startuj API i pokaż instrukcję
  set +e
  node dist/scripts/run-seed.js
  SEED_EXIT=$?
  set -e
  if [ "$SEED_EXIT" -ne 0 ]; then
    echo ""
    echo "============================================================"
    echo "SEED FAILED (często Prisma P2031)."
    echo "MongoDB musi działać jako replica set — inaczej Prisma"
    echo "nie zapisze grup / zgłoszeń."
    echo ""
    echo "EasyPanel → usługa Mongo:"
    echo "  1) Command: mongod --replSet rs0 --bind_ip_all"
    echo "  2) W konsoli Mongo uruchom:"
    echo "     rs.initiate({_id:'rs0',members:[{_id:0,host:'HOME-STACK_MONGO_HOST:27017'}]})"
    echo "     (host = nazwa serwisu Mongo w sieci EasyPanel)"
    echo "  3) DATABASE_URL dopisz: &replicaSet=rs0"
    echo "  4) Restart aplikacji + SEED_ON_START=true"
    echo "============================================================"
    echo ""
  fi
else
  echo "Skipping seed (groups already present or SEED_ON_START=false)."
fi

echo "Starting server on port ${PORT:-3000}..."
exec node dist/index.js
