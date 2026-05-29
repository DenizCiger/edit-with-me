FROM oven/bun:1.3.7-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production --ignore-scripts

FROM oven/bun:1.3.7-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache su-exec
RUN addgroup --system --gid 1001 bunjs
RUN adduser --system --uid 1001 bunapp --ingroup bunjs

COPY --from=deps /app/node_modules ./node_modules
COPY lib ./lib
COPY server ./server
COPY --chown=root:root server/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && mkdir -p /app/data

EXPOSE 4444

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
