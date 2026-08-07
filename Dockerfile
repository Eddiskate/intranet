# syntax=docker/dockerfile:1

# ── Frontend (Angular) ──────────────────────────────────────────────
FROM node:22-bookworm-slim AS frontend-build
WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build -- --configuration=production

# ── Backend (Node + Prisma) ─────────────────────────────────────────
FROM node:22-bookworm-slim AS backend-build
WORKDIR /app/backend

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY backend/package.json backend/package-lock.json ./
RUN npm ci

COPY backend/ ./
RUN npx prisma generate \
  && npm run build

# ── Runtime ─────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    UPLOADS_DIR=/data/uploads \
    SEED_ON_START=false

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /data/uploads

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev \
  && npm install prisma@6 tsx --no-save \
  && npm cache clean --force

COPY --from=backend-build /app/backend/dist ./dist
COPY --from=backend-build /app/backend/prisma ./prisma
COPY --from=frontend-build /app/frontend/dist/frontend/browser ./public
COPY docker/entrypoint.sh /entrypoint.sh

RUN npx prisma generate \
  && chmod +x /entrypoint.sh

EXPOSE 3000

VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/entrypoint.sh"]
