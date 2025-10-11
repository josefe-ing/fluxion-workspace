# ========================================
# Dockerfile - Fluxion AI ETL
# Python ETL + SQL Server Connectivity + DuckDB
# ========================================

FROM python:3.11-slim

# Metadata
LABEL maintainer="josefe-ing"
LABEL project="fluxion-ai"
LABEL component="etl"

# Set working directory
WORKDIR /app

# Install system dependencies for pyodbc + SQL Server
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    gnupg2 \
    unixodbc \
    unixodbc-dev \
    && curl https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/microsoft-prod.gpg] https://packages.microsoft.com/debian/12/prod bookworm main" > /etc/apt/sources.list.d/mssql-release.list \
    && apt-get update \
    && ACCEPT_EULA=Y apt-get install -y msodbcsql18 \
    && rm -rf /var/lib/apt/lists/*

# Copy ETL requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Install Sentry SDK
RUN pip install --no-cache-dir sentry-sdk

# Copy ETL code
COPY core/ ./core/
COPY scripts/ ./scripts/
COPY *.py ./

# Create directories
RUN mkdir -p /data /app/logs

# Environment variables
ENV PYTHONUNBUFFERED=1
ENV TZ=America/Caracas

# Default command (can be overridden)
CMD ["python3", "etl_inventario.py"]
