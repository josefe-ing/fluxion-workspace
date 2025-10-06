#!/bin/bash
#
# Script de Migración a EFS Cifrado
# ===================================
#
# Este script migra datos del EFS actual (sin cifrado) al nuevo EFS cifrado con KMS.
#
# ADVERTENCIA: Este proceso requiere DOWNTIME. El servicio backend estará offline
# durante la copia de datos (~15-30 minutos para 16GB).
#
# Pasos:
# 1. Detener servicio backend (ECS)
# 2. Montar EFS antiguo y nuevo
# 3. Copiar datos con rsync
# 4. Verificar integridad
# 5. Actualizar stack CDK
# 6. Reiniciar servicio con nuevo EFS
#

set -e  # Exit on error
set -u  # Exit on undefined variable

# ==========================================
# Configuración
# ==========================================

OLD_EFS_ID="${OLD_EFS_ID:-fs-XXXXXXXX}"  # Reemplazar con ID del EFS actual
NEW_EFS_ID="${NEW_EFS_ID:-fs-YYYYYYYY}"  # Se obtiene después del deploy
REGION="us-east-1"
MOUNT_POINT_OLD="/mnt/efs-old"
MOUNT_POINT_NEW="/mnt/efs-new"
ECS_CLUSTER="fluxion-cluster"
ECS_SERVICE="FluxionBackendService"
DB_FILE="fluxion_production.db"

# Colors para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ==========================================
# Funciones
# ==========================================

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    log_info "Verificando prerequisitos..."

    # Check if running on EC2 or ECS
    if ! curl -s --max-time 1 http://169.254.169.254/latest/meta-data/instance-id > /dev/null; then
        log_error "Este script debe ejecutarse en una instancia EC2/ECS en la misma VPC que el EFS"
        exit 1
    fi

    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI no está instalado"
        exit 1
    fi

    # Check rsync
    if ! command -v rsync &> /dev/null; then
        log_error "rsync no está instalado"
        exit 1
    fi

    log_info "✅ Prerequisitos cumplidos"
}

stop_backend_service() {
    log_warn "Deteniendo servicio backend..."
    aws ecs update-service \
        --cluster "$ECS_CLUSTER" \
        --service "$ECS_SERVICE" \
        --desired-count 0 \
        --region "$REGION" > /dev/null

    log_info "Esperando a que todas las tasks se detengan..."
    aws ecs wait services-stable \
        --cluster "$ECS_CLUSTER" \
        --services "$ECS_SERVICE" \
        --region "$REGION"

    log_info "✅ Servicio backend detenido"
}

mount_efs() {
    local efs_id=$1
    local mount_point=$2

    log_info "Montando EFS ${efs_id} en ${mount_point}..."

    # Crear directorio de montaje
    sudo mkdir -p "$mount_point"

    # Instalar amazon-efs-utils si no está
    if ! command -v mount.efs &> /dev/null; then
        log_info "Instalando amazon-efs-utils..."
        sudo yum install -y amazon-efs-utils || sudo apt-get install -y amazon-efs-utils
    fi

    # Montar EFS
    sudo mount -t efs -o tls "${efs_id}:/" "$mount_point"

    if mountpoint -q "$mount_point"; then
        log_info "✅ EFS montado correctamente en ${mount_point}"
    else
        log_error "Fallo al montar EFS"
        exit 1
    fi
}

copy_data() {
    log_info "Iniciando copia de datos..."
    log_info "Origen: ${MOUNT_POINT_OLD}"
    log_info "Destino: ${MOUNT_POINT_NEW}"

    # Mostrar tamaño de datos a copiar
    local data_size=$(sudo du -sh "${MOUNT_POINT_OLD}/fluxion-data" | cut -f1)
    log_info "Tamaño total a copiar: ${data_size}"

    # Rsync con progreso
    sudo rsync -avz --progress \
        "${MOUNT_POINT_OLD}/fluxion-data/" \
        "${MOUNT_POINT_NEW}/fluxion-data/"

    log_info "✅ Copia de datos completada"
}

verify_data_integrity() {
    log_info "Verificando integridad de datos..."

    # Verificar que el archivo de base de datos existe
    if [ ! -f "${MOUNT_POINT_NEW}/fluxion-data/${DB_FILE}" ]; then
        log_error "Base de datos no encontrada en EFS nuevo"
        exit 1
    fi

    # Comparar checksums
    local old_checksum=$(sudo md5sum "${MOUNT_POINT_OLD}/fluxion-data/${DB_FILE}" | cut -d' ' -f1)
    local new_checksum=$(sudo md5sum "${MOUNT_POINT_NEW}/fluxion-data/${DB_FILE}" | cut -d' ' -f1)

    if [ "$old_checksum" != "$new_checksum" ]; then
        log_error "Checksums no coinciden!"
        log_error "Old: ${old_checksum}"
        log_error "New: ${new_checksum}"
        exit 1
    fi

    log_info "✅ Checksums coinciden: ${new_checksum}"

    # Verificar permisos
    local perms=$(sudo stat -c '%a' "${MOUNT_POINT_NEW}/fluxion-data/${DB_FILE}")
    if [ "$perms" != "755" ] && [ "$perms" != "644" ]; then
        log_warn "Permisos inusuales: ${perms}. Ajustando..."
        sudo chmod 644 "${MOUNT_POINT_NEW}/fluxion-data/${DB_FILE}"
    fi

    log_info "✅ Integridad verificada"
}

unmount_efs() {
    local mount_point=$1

    log_info "Desmontando ${mount_point}..."
    sudo umount "$mount_point"
    sudo rmdir "$mount_point"

    log_info "✅ EFS desmontado"
}

update_cdk_stack() {
    log_info "Actualizando stack CDK para usar nuevo EFS..."

    cat << 'EOF'
⚠️  ACCIÓN MANUAL REQUERIDA ⚠️

1. Actualizar infrastructure/bin/infrastructure.ts:

   // Cambiar de:
   new InfrastructureStack(app, 'InfrastructureStack', { ... });

   // A:
   new InfrastructureStackEncrypted(app, 'InfrastructureStack', { ... });

2. Ejecutar:
   cd infrastructure
   npm run build
   cdk diff
   cdk deploy --require-approval never

3. Volver a este script y presionar ENTER para continuar
EOF

    read -p "Presiona ENTER cuando hayas completado el deploy de CDK..."
}

start_backend_service() {
    log_info "Reiniciando servicio backend con nuevo EFS..."

    aws ecs update-service \
        --cluster "$ECS_CLUSTER" \
        --service "$ECS_SERVICE" \
        --desired-count 1 \
        --region "$REGION" \
        --force-new-deployment > /dev/null

    log_info "Esperando a que el servicio esté stable..."
    aws ecs wait services-stable \
        --cluster "$ECS_CLUSTER" \
        --services "$ECS_SERVICE" \
        --region "$REGION"

    log_info "✅ Servicio backend reiniciado"
}

health_check() {
    log_info "Verificando health del servicio..."

    # Obtener ALB DNS
    local alb_dns=$(aws elbv2 describe-load-balancers \
        --names fluxion-alb \
        --region "$REGION" \
        --query 'LoadBalancers[0].DNSName' \
        --output text)

    # Health check
    local max_attempts=10
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        log_info "Health check intento ${attempt}/${max_attempts}..."

        if curl -sf "http://${alb_dns}/" > /dev/null; then
            log_info "✅ Servicio respondiendo correctamente"
            return 0
        fi

        sleep 10
        ((attempt++))
    done

    log_error "Servicio no responde después de ${max_attempts} intentos"
    return 1
}

cleanup_old_efs() {
    log_warn "¿Deseas eliminar el EFS antiguo (sin cifrado)? [y/N]"
    read -r response

    if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
        log_warn "Eliminando EFS antiguo ${OLD_EFS_ID}..."

        # Primero eliminar mount targets
        local mount_targets=$(aws efs describe-mount-targets \
            --file-system-id "$OLD_EFS_ID" \
            --region "$REGION" \
            --query 'MountTargets[*].MountTargetId' \
            --output text)

        for mt in $mount_targets; do
            log_info "Eliminando mount target ${mt}..."
            aws efs delete-mount-target --mount-target-id "$mt" --region "$REGION"
        done

        log_info "Esperando a que mount targets se eliminen..."
        sleep 30

        # Eliminar EFS
        aws efs delete-file-system --file-system-id "$OLD_EFS_ID" --region "$REGION"
        log_info "✅ EFS antiguo eliminado"
    else
        log_info "EFS antiguo conservado. Puedes eliminarlo manualmente más tarde."
    fi
}

# ==========================================
# Main
# ==========================================

main() {
    log_info "=========================================="
    log_info "Migración a EFS Cifrado - Fluxion AI"
    log_info "=========================================="
    echo

    log_warn "Este proceso causará DOWNTIME del servicio backend."
    log_warn "EFS Antiguo: ${OLD_EFS_ID}"
    log_warn "EFS Nuevo: ${NEW_EFS_ID}"
    echo
    read -p "¿Continuar? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Migración cancelada"
        exit 0
    fi

    check_prerequisites

    # Paso 1: Detener servicio
    stop_backend_service

    # Paso 2: Montar ambos EFS
    mount_efs "$OLD_EFS_ID" "$MOUNT_POINT_OLD"
    mount_efs "$NEW_EFS_ID" "$MOUNT_POINT_NEW"

    # Paso 3: Copiar datos
    copy_data

    # Paso 4: Verificar integridad
    verify_data_integrity

    # Paso 5: Desmontar
    unmount_efs "$MOUNT_POINT_OLD"
    unmount_efs "$MOUNT_POINT_NEW"

    # Paso 6: Actualizar CDK (manual)
    update_cdk_stack

    # Paso 7: Reiniciar servicio
    start_backend_service

    # Paso 8: Health check
    if health_check; then
        log_info ""
        log_info "=========================================="
        log_info "✅ MIGRACIÓN COMPLETADA EXITOSAMENTE"
        log_info "=========================================="
        log_info "El servicio está corriendo con EFS cifrado"
        echo

        # Paso 9: Cleanup (opcional)
        cleanup_old_efs
    else
        log_error "Health check falló. Revisar logs del servicio."
        exit 1
    fi
}

# Ejecutar
main "$@"
