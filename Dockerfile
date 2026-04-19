FROM node:20-alpine AS builder
WORKDIR /app

# Build tools needed for native npm packages (bufferutil, etc.)
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Remove devDependencies in place so we can copy a lean node_modules
RUN npm prune --omit=dev

# ── Runner ────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist         ./dist
COPY package*.json ./

ENV NODE_ENV=production

EXPOSE 5000
CMD ["node", "dist/index.cjs"]
