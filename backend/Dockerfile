# ========================================
# Dockerfile - Fluxion AI Backend
# FastAPI + DuckDB + Sentry + Forecast
# ========================================

FROM python:3.11-slim

# Metadata
LABEL maintainer="josefe-ing"
LABEL project="fluxion-ai"
LABEL component="backend"
LABEL version="2.1.3"

# Set working directory
WORKDIR /app

# Install system dependencies including AWS CLI
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    unzip \
    && curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" \
    && unzip awscliv2.zip \
    && ./aws/install \
    && rm -rf aws awscliv2.zip \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Install Sentry SDK
RUN pip install --no-cache-dir sentry-sdk[fastapi]

# Copy application code
COPY . .

# Create data directory for DuckDB
RUN mkdir -p /data

# Expose port
EXPOSE 8001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:8001/ || exit 1

# Run application with startup script
CMD ["/bin/bash", "startup.sh"]
