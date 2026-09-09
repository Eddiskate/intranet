# Budowanie SEKWENCYJNE (frontend → backend → runtime),
# żeby EasyPanel nie odpalał 3 ciężkich etapów naraz i nie wisiał godzinami.

ARG NPM_FLAGS="--no-audit --no-fund --fetch-retries=3 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000"

# ── 1) Frontend (Angular) ───────────────────────────────────────────
FROM node:22-bookworm AS frontend-build
ARG NPM_FLAGS
WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci ${NPM_FLAGS}

COPY frontend/ ./
RUN npm run build -- --configuration=production

# ── 2) Backend (czeka na frontend — sekwencja) ──────────────────────
FROM node:22-bookworm AS backend-build
ARG NPM_FLAGS
WORKDIR /app/backend

# Sztuczna zależność: etap startuje dopiero po zbudowaniu FE
COPY --from=frontend-build /app/frontend/dist/frontend/browser /tmp/frontend-public

COPY backend/package.json backend/package-lock.json ./
RUN npm ci ${NPM_FLAGS}

COPY backend/ ./
RUN npm run build \
  && npm prune --omit=dev \
  && rm -rf /tmp/frontend-public

# ── 3) Runtime ──────────────────────────────────────────────────────
FROM node:22-bookworm AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    UPLOADS_DIR=/data/uploads \
    SEED_ON_START=false \
    NPM_CONFIG_UPDATE_NOTIFIER=false

RUN mkdir -p /data/uploads

COPY --from=backend-build /app/backend/package.json ./package.json
COPY --from=backend-build /app/backend/node_modules ./node_modules
COPY --from=backend-build /app/backend/dist ./dist
COPY --from=frontend-build /app/frontend/dist/frontend/browser ./public
COPY docker/entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh

EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/entrypoint.sh"]
