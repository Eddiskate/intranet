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

should_seed="false"
if [ "${SEED_ON_START}" = "true" ]; then
  should_seed="true"
elif [ "${SEED_ON_START}" = "false" ]; then
  should_seed="false"
else
  GROUP_COUNT="$(node -e "
    const { MongoClient } = require('mongodb');
    const url = process.env.DATABASE_URL;
    (async () => {
      const c = new MongoClient(url);
      await c.connect();
      const n = await c.db().collection('TicketGroup').countDocuments();
      console.log(n);
      await c.close();
    })().catch((e) => { console.error(e); process.exit(1); });
  ")" || GROUP_COUNT="?"
  echo "Ticket groups in DB: ${GROUP_COUNT}"
  if [ "${GROUP_COUNT}" = "0" ]; then
    should_seed="true"
  fi
fi

if [ "${should_seed}" = "true" ]; then
  echo "Seeding default groups + agents..."
  set +e
  node dist/scripts/run-seed.js
  SEED_EXIT=$?
  set -e
  if [ "$SEED_EXIT" -ne 0 ]; then
    echo "SEED FAILED — sprawdź DATABASE_URL / logi Mongo."
  fi
else
  echo "Skipping seed (groups already present or SEED_ON_START=false)."
fi

echo "Starting server on port ${PORT:-3000}..."
exec node dist/index.js
