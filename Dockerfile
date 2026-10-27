# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# ClimaSaaS API — imagem de produção multi-stage
#
# Stages:
#   deps        → instala dependências da API (sem devDeps)
#   web-builder → faz o build do painel React/Vite
#   runner      → imagem final mínima (~200 MB)
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: dependências da API ──────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
# --omit=dev garante que devDependencies (nodemon) não entram na imagem final
RUN npm ci --omit=dev

# ── Stage 2: build do painel web ──────────────────────────────────────────────
FROM node:22-alpine AS web-builder
WORKDIR /app
COPY web/package*.json ./web/
RUN npm --prefix web ci
COPY web ./web
RUN npm --prefix web run build

# ── Stage 3: imagem final ─────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copia apenas o necessário para rodar
COPY --from=deps        /app/node_modules   ./node_modules
COPY --from=web-builder /app/web/dist       ./web/dist
COPY src                                    ./src
COPY server.js                              .
COPY package.json                           .

# Diretório para uploads temporários (efêmero no Fargate — fotos vão pro Postgres)
RUN mkdir -p tmp/uploads

# Usuário não-root para seguir boas práticas de segurança de container
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3000

# Health check nativo do Docker (também usado pelo ECS)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
