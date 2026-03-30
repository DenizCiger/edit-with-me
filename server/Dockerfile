FROM oven/bun:1.3.7-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.3.7-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 bunjs
RUN adduser --system --uid 1001 bunapp --ingroup bunjs

COPY --from=deps /app/node_modules ./node_modules
COPY server/ws.ts ./server/ws.ts

USER bunapp
EXPOSE 4444

CMD ["bun", "run", "server/ws.ts"]
