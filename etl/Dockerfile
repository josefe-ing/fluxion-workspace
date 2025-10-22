# ========================================
# Dockerfile - Fluxion AI ETL (Production)
# Python ETL + SQL Server Connectivity + DuckDB + AWS Integration
# ========================================

FROM python:3.11-slim

# Metadata
LABEL maintainer="josefe-ing"
LABEL project="fluxion-ai"
LABEL component="etl"
LABEL version="1.0.0"

# Set working directory
WORKDIR /app

# Install system dependencies for pyodbc + SQL Server + AWS CLI
# Multi-architecture support: auto-detect and install correct packages
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    unzip \
    gnupg2 \
    unixodbc \
    unixodbc-dev \
    freetds-dev \
    freetds-bin \
    tdsodbc \
    iproute2 \
    iputils-ping \
    procps \
    && curl https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg \
    && ARCH=$(dpkg --print-architecture) \
    && echo "deb [arch=$ARCH signed-by=/usr/share/keyrings/microsoft-prod.gpg] https://packages.microsoft.com/debian/12/prod bookworm main" > /etc/apt/sources.list.d/mssql-release.list \
    && apt-get update \
    && ACCEPT_EULA=Y apt-get install -y msodbcsql17 msodbcsql18 \
    && if [ "$ARCH" = "amd64" ]; then \
        curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"; \
    else \
        curl "https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip" -o "awscliv2.zip"; \
    fi \
    && unzip awscliv2.zip \
    && ./aws/install \
    && rm -rf aws awscliv2.zip \
    && rm -rf /var/lib/apt/lists/*

# Copy ETL requirements
COPY requirements.txt .

# Install Python dependencies + AWS SDK
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt && \
    pip install --no-cache-dir boto3 sentry-sdk

# Create non-root user with UID 1000 to match EFS Access Point
RUN groupadd -g 1000 etluser && \
    useradd -u 1000 -g 1000 -m -s /bin/bash etluser

# Copy ETL code
COPY core/ ./core/
COPY scripts/ ./scripts/
COPY *.py ./

# Copy entrypoint script (configura TCP keepalive automáticamente)
COPY docker-entrypoint.sh /docker-entrypoint.sh

# Create startup script for production
COPY startup-etl.sh /app/startup-etl.sh
RUN chmod +x /app/startup-etl.sh && chmod +x /docker-entrypoint.sh

# Create directories and set ownership
RUN mkdir -p /data /app/logs && \
    chown -R etluser:etluser /app /data

# Switch to non-root user
USER etluser

# Environment variables
ENV PYTHONUNBUFFERED=1
ENV TZ=America/Caracas
ENV ENVIRONMENT=production

# Health check (checks if last ETL run was successful)
HEALTHCHECK --interval=5m --timeout=30s --start-period=2m --retries=3 \
  CMD test -f /app/logs/etl_last_success.flag || exit 1

# Entrypoint que configura TCP keepalive automáticamente
ENTRYPOINT ["/docker-entrypoint.sh"]

# Default command - use startup script
CMD ["/app/startup-etl.sh"]
