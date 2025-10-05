# ========================================
# Dockerfile - Fluxion AI Frontend
# React + TypeScript + Vite + Nginx
# Multi-stage build for optimized production
# ========================================

# ==================== STAGE 1: Build ====================
FROM node:20-alpine AS builder

# Metadata
LABEL maintainer="josefe-ing"
LABEL project="fluxion-ai"
LABEL component="frontend"

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production=false

# Copy source code
COPY . .

# Build application
RUN npm run build

# ==================== STAGE 2: Production ====================
FROM nginx:alpine

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
