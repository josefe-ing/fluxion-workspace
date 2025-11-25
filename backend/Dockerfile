# Dockerfile para Fluxion Backend - FastAPI + DuckDB
FROM python:3.11-slim

# Instalar dependencias del sistema incluyendo AWS CLI
RUN apt-get update && apt-get install -y \
    curl \
    unzip \
    && curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" \
    && unzip awscliv2.zip \
    && ./aws/install \
    && rm -rf aws awscliv2.zip \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user with UID 1000 to match EFS Access Point
RUN groupadd -g 1000 appuser && \
    useradd -u 1000 -g 1000 -m -s /bin/bash appuser

# Crear directorio de trabajo
WORKDIR /app

# Copiar requirements
COPY backend/requirements.txt .

# Instalar dependencias Python
RUN pip install --no-cache-dir -r requirements.txt

# Copiar código del backend (incluye startup.sh)
COPY backend/ .

# Crear directorio para schemas de base de datos
RUN mkdir -p /app/database

# Copiar schemas de migraciones desde el directorio database
COPY database/migrate_abc_v2_schema.sql /app/database/migrate_abc_v2_schema.sql
COPY database/schema_abc_v2.sql /app/database/schema_abc_v2.sql
COPY database/schema_abc_xyz.sql /app/database/schema_abc_xyz.sql
COPY database/schema_etl_tracking.sql /app/database/schema_etl_tracking.sql

# Copiar migraciones de PostgreSQL
COPY database/migrations/ /app/database/migrations/

# Copiar scripts de cálculo ABC-XYZ
COPY database/calcular_abc_v2_por_tienda.py /app/database/calcular_abc_v2_por_tienda.py
COPY database/calcular_xyz_por_tienda.py /app/database/calcular_xyz_por_tienda.py

# Hacer archivos ejecutables
RUN chmod +x /app/startup.sh /app/run_migrations.py

# Create /data directory and set ownership
RUN mkdir -p /data && chown -R appuser:appuser /data /app

# Switch to non-root user
USER appuser

# Exponer puerto
EXPOSE 8001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8001/ || exit 1

# Comando por defecto
CMD ["/app/startup.sh"]
