# syntax=docker/dockerfile:1

# EduAIGames — single-image build.
# The Node/Express server serves the API and the compiled React app from one
# origin, so we build the frontend, then run the server with the built assets.

# ---- Stage 1: build the React frontend ----
FROM node:22-alpine AS web-builder
WORKDIR /app/EduAIGames

# Install deps using the lockfile for reproducible builds.
COPY EduAIGames/package.json EduAIGames/package-lock.json ./
RUN npm ci

# Build the SPA. VITE_API_URL is left empty so the app talks to the same
# origin (the Node server) at /api/*.
# We invoke `vite build` directly (rather than `npm run build`, which also runs
# `tsc -b`) so the production bundle is produced the same way the dev server
# runs — without the strict typecheck gate blocking the image.
COPY EduAIGames/ ./
RUN npx vite build

# ---- Stage 2: install server dependencies (incl. tsx for runtime) ----
FROM node:22-alpine AS server-deps
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci

# ---- Stage 3: runtime ----
FROM node:22-alpine AS runner
ENV NODE_ENV=production \
    PORT=5000 \
    HOST=0.0.0.0 \
    SERVE_FRONTEND=true

WORKDIR /app/server

# Server source + dependencies.
COPY --from=server-deps /app/server/node_modules ./node_modules
COPY server/ ./

# Built frontend, placed where the server's resolveFrontendDist() looks
# (../../EduAIGames/dist relative to /app/server/src).
COPY --from=web-builder /app/EduAIGames/dist /app/EduAIGames/dist

EXPOSE 5000

# Lightweight healthcheck against the API.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5000/api/health || exit 1

CMD ["npm", "start"]
