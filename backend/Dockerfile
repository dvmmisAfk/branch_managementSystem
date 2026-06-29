FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

FROM deps AS builder
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev
COPY scripts ./scripts
COPY scripts/docker-entrypoint.sh /docker-entrypoint.sh
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
RUN npx prisma generate && chmod +x /docker-entrypoint.sh

# F-11: Run as non-root to limit blast radius of a Puppeteer/Chromium exploit.
# Chromium is launched with --no-sandbox (required for containerised use) so the
# OS-level process user is the main sandboxing layer.
RUN chown -R node:node /app /docker-entrypoint.sh
# Puppeteer writes temp files to /tmp — ensure the node user can write there.
RUN mkdir -p /tmp && chown node:node /tmp
USER node

EXPOSE 3001
ENTRYPOINT ["/docker-entrypoint.sh"]
