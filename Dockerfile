FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
# Ensure platform-specific optional dependencies (e.g. sherpa-onnx-* runtimes) are installed
# even if the build environment sets npm omit flags.
RUN npm ci --include=optional

FROM node:20-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN node scripts/download-piper-voices.mjs /app/piper-voices
RUN npx prisma generate
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=file:/data/chapterchase.db
ENV CHAPTERCHASE_DATA_DIR=/data
# sherpa-onnx-node depends on shared libraries shipped in the platform packages.
# Make them discoverable at runtime for the Node addon loader.
ENV LD_LIBRARY_PATH=/app/node_modules/sherpa-onnx-linux-x64:/app/node_modules/sherpa-onnx-linux-arm64:$LD_LIBRARY_PATH

# Piper/sherpa-onnx runtime dependencies:
# - libgomp1: OpenMP runtime used by onnxruntime builds
# - libstdc++6/libgcc-s1/libatomic1: common C++ runtime deps for native addons
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl libgomp1 libstdc++6 libgcc-s1 libatomic1 python3 python3-pip python3-venv \
  && python3 -m venv /opt/piper \
  && /opt/piper/bin/pip install --no-cache-dir 'piper-tts==1.2.0' \
  && rm -rf /var/lib/apt/lists/* \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --ingroup nodejs chapterchase
ENV PATH=/opt/piper/bin:$PATH
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/config ./config
COPY --from=builder /app/piper-voices ./piper-voices

RUN mkdir -p /data /library /data/tts/piper && chown -R chapterchase:nodejs /data /app
USER chapterchase
EXPOSE 3000

CMD ["node", "scripts/start-chapterchase.mjs"]
