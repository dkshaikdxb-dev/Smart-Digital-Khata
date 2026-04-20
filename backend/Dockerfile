# syntax=docker/dockerfile:1.6
# =========================================================================
# Backend — Node.js 20 (Alpine), multi-stage
# =========================================================================

FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache wget tini tzdata && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

COPY --from=deps /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs . .

USER nodejs
EXPOSE 4000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/server.js"]
