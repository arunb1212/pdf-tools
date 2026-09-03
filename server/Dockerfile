# Alpine container with native PDF engines.
# Build:  docker build -t pdf-tools-server ./server
# Run:    docker compose -f server/docker-compose.yml up --build
FROM node:22-alpine

RUN apk add --no-cache \
  ghostscript \
  qpdf \
  poppler-utils \
  tesseract-ocr \
  tesseract-ocr-data-eng

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

COPY tsconfig.json ./
COPY src ./src
RUN npm install --include=dev && npm run build && npm prune --omit=dev && rm -rf src tsconfig.json

ENV NODE_ENV=production \
    PORT=8080 \
    TMPDIR=/dev/shm

EXPOSE 8080

# /dev/shm is the Linux RAM-disk: buffers never touch persistent disk.
CMD ["node", "dist/index.js"]
