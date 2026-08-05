# Stage 1: Install dependencies
FROM node:22-alpine AS deps

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install all dependencies (including devDependencies for build)
RUN npm ci


# Stage 2: Build the application
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build the NestJS application
RUN npm run build


# Stage 3: Production runner
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

# Copy package files and install production dependencies only
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm install prisma dotenv

# Copy Prisma schema and migrations from builder
COPY --from=builder /app/prisma/schema ./prisma/schema
COPY --from=builder /app/prisma/migrations ./prisma/migrations
COPY prisma.config.ts ./

# Generate Prisma client for production (ensures correct Alpine binaries)
RUN npx prisma generate

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Change ownership to non-root user
RUN chown -R nestjs:nodejs /app

USER nestjs

EXPOSE 7065


CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main"]
