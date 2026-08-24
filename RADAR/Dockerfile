FROM node:20-bookworm AS base

# ── Install system deps for Playwright Chromium + sharp/libvips ──
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Playwright Chromium dependencies
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libdbus-1-3 libxkbcommon0 libatspi2.0-0 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
    libpango-1.0-0 libcairo2 libasound2 libwayland-client0 \
    # sharp/libvips
    libvips-dev \
    # General
    curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# ── Install Playwright browsers (Chromium only) ──
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
RUN npx playwright install --with-deps chromium

# ── Download embeddings model at build time ──
RUN node -e "const{pipeline}=require('@xenova/transformers');(async()=>{console.log('Downloading Xenova/multilingual-e5-small (~500MB)...');await pipeline('feature-extraction','Xenova/multilingual-e5-small');console.log('Model cached.');})().catch(e=>{console.error(e);process.exit(1);})"

# ── Build Next.js app ──
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN npm run build

# ── Production stage ──
FROM node:20-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libdbus-1-3 libxkbcommon0 libatspi2.0-0 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
    libpango-1.0-0 libcairo2 libasound2 libwayland-client0 \
    curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=base /app/.next ./.next
COPY --from=base /app/public ./public
COPY --from=base /app/package.json ./
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/src ./src

# Playwright chromium binary + deps
COPY --from=base /root/.cache/ms-playwright /root/.cache/ms-playwright

# Embeddings cache (pre-downloaded)
COPY --from=base /root/.cache/xenova /root/.cache/xenova

EXPOSE 3000
CMD ["npm", "start"]
