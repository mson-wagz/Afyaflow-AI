FROM node:24-bookworm-slim AS frontend
WORKDIR /app/src/frontend
COPY src/frontend/package*.json ./
RUN npm ci
COPY src/frontend ./
COPY src/shared /app/src/shared
ARG APP_MODE=research
ENV VITE_APP_MODE=$APP_MODE
RUN npm run build

FROM node:24-bookworm-slim AS backend
WORKDIR /app
COPY package*.json tsconfig*.json ./
RUN npm ci
COPY src ./src
COPY services ./services
RUN npm run build:backend

FROM node:24-bookworm-slim AS runtime-base
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=backend /app/dist ./dist
COPY src/backend/src/database/*.sql ./src/backend/src/database/
COPY services/mcp/protocols ./services/mcp/protocols
COPY --from=frontend /app/src/frontend/dist ./src/frontend/dist
# The borrowed filesystem server has no write permission to protocol resources.
RUN chmod -R a-w services/mcp/protocols
USER node
EXPOSE 3000
CMD ["node", "dist/src/backend/src/main.js"]

# Build with --target competition --build-arg APP_MODE=competition.
# Historical source files never enter these image layers.
FROM runtime-base AS competition
ENV APP_MODE=competition AI_PROVIDER=ollama

# The existing AWS research deployment remains the default target.
FROM runtime-base AS runtime
COPY data/mimic-iv-ed-demo-2.2 ./data/mimic-iv-ed-demo-2.2
