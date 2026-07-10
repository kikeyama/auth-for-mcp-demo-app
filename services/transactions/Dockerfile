FROM node:22-alpine AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package*.json ./
RUN npm ci --omit=dev

# Build TypeScript
FROM base AS builder
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npx tsc

# Production image
FROM base AS runner
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

EXPOSE 4001

CMD ["node", "dist/index.js"]
