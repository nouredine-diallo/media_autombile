FROM node:20-bookworm AS base

# ── Install system deps for Playwright Chromium + sharp/libvips ──
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libdbus-1-3 libxkbcommon0 libatspi2.0-0 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
    libpango-1.0-0 libcairo2 libasound2 libwayland-client0 \
    libvips-dev curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# ── Install deps + Playwright ──
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
RUN npx playwright install --with-deps chromium

# ── Download u2net.onnx (176MB) for segmentation ──
RUN mkdir -p models && \
    curl -L -o models/u2net.onnx \
    https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx && \
    echo "u2net.onnx downloaded" && ls -lh models/u2net.onnx

# ── Build Next.js app ──
COPY . .
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
COPY --from=base /app/models ./models

# Playwright chromium binary + deps
COPY --from=base /root/.cache/ms-playwright /root/.cache/ms-playwright

EXPOSE 3000
CMD ["npm", "start"]
