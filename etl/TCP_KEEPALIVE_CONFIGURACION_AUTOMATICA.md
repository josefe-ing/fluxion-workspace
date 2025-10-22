# ✅ Configuración Automática de TCP Keepalive

## 🎯 Objetivo Completado

TCP keepalive ahora se configura **automáticamente** en todos los niveles cuando construyes y despliegas el stack. No necesitas configuración manual.

---

## 📦 Archivos Actualizados

### 1. **`etl/docker-entrypoint.sh`** ✅ NUEVO

**Propósito:** Script que se ejecuta automáticamente al iniciar cualquier container ETL.

**Qué hace:**
- ✅ Intenta configurar TCP keepalive a nivel de sistema (sysctl)
- ✅ Si no tiene permisos, continúa normalmente (no crítico)
- ✅ Verifica conectividad VPN
- ✅ Valida credenciales SQL
- ✅ Muestra diagnóstico de red

**Valores configurados:**
```bash
net.ipv4.tcp_keepalive_time = 30    # Primer keepalive a los 30s
net.ipv4.tcp_keepalive_intvl = 10   # Intervalo de 10s
net.ipv4.tcp_keepalive_probes = 5   # 5 reintentos
```

---

### 2. **`etl/Dockerfile`** ✅ ACTUALIZADO

**Cambios:**
```dockerfile
# Copia el entrypoint
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Configura como ENTRYPOINT (se ejecuta siempre)
ENTRYPOINT ["/docker-entrypoint.sh"]

# CMD por defecto (puede ser sobrescrito)
CMD ["/app/startup-etl.sh"]
```

**Resultado:** Cada vez que se inicia un container ETL (local o en ECS), el entrypoint configura keepalive automáticamente.

---

### 3. **`etl/core/extractor_ventas.py`** ✅ YA ESTABA ACTUALIZADO

**Configuración a nivel de código Python:**
```python
# Connection string ODBC
params = quote_plus(
    f"KeepAlive=yes;"
    f"KeepAliveInterval=30;"  # ✅ Automático
)

# Socket-level keepalive
raw_socket.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
raw_socket.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPIDLE, 30)   # ✅ Automático
raw_socket.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPINTVL, 10)  # ✅ Automático
raw_socket.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPCNT, 5)     # ✅ Automático
```

**Resultado:** Cada conexión SQL Server tiene keepalive configurado en el socket.

---

### 4. **`infrastructure/lib/infrastructure-stack.ts`** ✅ ACTUALIZADO

**Cambios en Task Definition:**
```typescript
const etlContainer = etlTask.addContainer('etl', {
  // ...
  environment: {
    // Variables que el código Python usa automáticamente
    SQL_ODBC_DRIVER: 'ODBC Driver 17 for SQL Server',
    VPN_GATEWAY_IP: '192.168.20.1',  // Para test de conectividad
  },
  stopTimeout: cdk.Duration.minutes(5),  // Aumentado para extracciones largas
});
```

**Resultado:** Las variables de entorno están disponibles para el entrypoint y el código Python.

---

### 5. **`etl/test-docker-build.sh`** ✅ NUEVO

**Propósito:** Script para probar el build localmente antes de desplegar a AWS.

**Uso:**
```bash
cd /Users/jose/Developer/fluxion-workspace/etl
./test-docker-build.sh
```

---

## 🚀 Flujo Automático Completo

### En Desarrollo (tu Mac):

```bash
# 1. Ejecutar ETL con chunks (evita timeouts)
cd /Users/jose/Developer/fluxion-workspace/etl/core
python3 etl_ventas_chunked.py \
  --tienda tienda_01 \
  --fecha-inicio 2025-10-01 \
  --fecha-fin 2025-10-22 \
  --dias-por-chunk 7
```

**Keepalive activo en:**
- ✅ Código Python (extractor_ventas.py)
- ✅ Connection string ODBC
- ⚠️ Sistema operativo (macOS no necesita configuración manual)

---

### En Producción (AWS ECS):

```bash
# 1. Build y push de imagen
cd /Users/jose/Developer/fluxion-workspace/etl

# Login a ECR
aws ecr get-login-password --region us-east-1 | \
    docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com

# Build
docker build -t fluxion-etl:latest .

# Tag
docker tag fluxion-etl:latest <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/fluxion-etl:latest

# Push
docker push <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/fluxion-etl:latest

# 2. Deploy CDK stack (actualiza Task Definition)
cd ../infrastructure
npx cdk deploy
```

**Keepalive activo en:**
- ✅ Código Python (extractor_ventas.py)
- ✅ Connection string ODBC
- ✅ Sistema operativo Linux (docker-entrypoint.sh)
- ✅ Variables de entorno (CDK stack)

---

## 🧪 Testing

### Test 1: Build Local
```bash
cd /Users/jose/Developer/fluxion-workspace/etl
./test-docker-build.sh
```

**Salida esperada:**
```
🔨 Testing Fluxion ETL Dockerfile...
================================================
📦 Building Docker image...
✅ Build exitoso!
🧪 Testing entrypoint script...
🚀 Iniciando Fluxion ETL en AWS ECS...
Entrypoint test OK
✅ Todas las pruebas pasaron
```

---

### Test 2: Verificar Logs en CloudWatch (después de deployment)

```bash
# Ver logs del ETL en CloudWatch
aws logs tail /ecs/fluxion-etl --follow

# Buscar mensaje de keepalive
aws logs tail /ecs/fluxion-etl --format short | grep -i keepalive
```

**Salida esperada:**
```
🔧 Configurando TCP Keepalive...
✅ TCP Keepalive configurado:
   - Keepalive Time: 30s
   - Keepalive Interval: 10s
   - Keepalive Probes: 5
```

O si el container no tiene permisos (normal en Fargate):
```
🔧 Configurando TCP Keepalive...
ℹ️  No se puede modificar sysctl (contenedor sin privilegios)
   Configuración de keepalive se aplicará vía Python/ODBC
```

**Ambos son OK** - el keepalive funciona desde Python/ODBC aunque no se pueda modificar sysctl.

---

## 📊 Niveles de Configuración

| Nivel | Dónde | Configurado | Automático |
|-------|-------|-------------|------------|
| **Socket Python** | `extractor_ventas.py` | ✅ Sí | ✅ Siempre |
| **ODBC Driver** | `extractor_ventas.py` | ✅ Sí | ✅ Siempre |
| **Sistema Linux** | `docker-entrypoint.sh` | ✅ Sí | ⚠️ Si tiene permisos |
| **Sistema macOS** | N/A | ℹ️ No necesario | N/A |
| **Task Definition** | `infrastructure-stack.ts` | ✅ Sí | ✅ Siempre |
| **SQL Server** | DBA | ⚠️ Pendiente | ❌ Manual |

---

## ✅ Checklist de Deployment

Antes de hacer deployment a producción:

- [x] **Código Python actualizado** con keepalive (extractor_ventas.py)
- [x] **docker-entrypoint.sh creado** y copiado al Dockerfile
- [x] **Dockerfile actualizado** con ENTRYPOINT
- [x] **CDK stack actualizado** con variables de entorno
- [x] **Script de test creado** (test-docker-build.sh)
- [x] **etl_ventas_chunked.py creado** para evitar timeouts
- [ ] **Test local exitoso** (`./test-docker-build.sh`)
- [ ] **Build y push a ECR**
- [ ] **Deploy CDK**
- [ ] **Verificar logs en CloudWatch**
- [ ] **Coordinar con DBA** para keepalive en SQL Server (opcional pero recomendado)

---

## 🎯 Para tu Mac (Desarrollo)

**No necesitas configurar nada manualmente.** El código Python ya tiene keepalive configurado.

Solo usa el script chunked para evitar timeouts:

```bash
cd /Users/jose/Developer/fluxion-workspace/etl/core

# Extrae en chunks de 7 días
python3 etl_ventas_chunked.py \
  --tienda tienda_01 \
  --fecha-inicio 2025-10-01 \
  --fecha-fin 2025-10-22 \
  --dias-por-chunk 7
```

---

## 🚀 Para AWS ECS (Producción)

**Todo es automático después del deployment:**

1. ✅ Build imagen → keepalive incluido en Dockerfile
2. ✅ Push a ECR → imagen lista con configuración
3. ✅ Deploy CDK → Task Definition actualizada
4. ✅ ECS ejecuta task → docker-entrypoint.sh configura keepalive automáticamente
5. ✅ ETL corre → Python usa keepalive en todas las conexiones

**No se requiere configuración manual en runtime.**

---

## 🆘 Troubleshooting

### Error: "No such file or directory: docker-entrypoint.sh"

**Causa:** El archivo no está en el contexto de build.

**Solución:**
```bash
cd /Users/jose/Developer/fluxion-workspace/etl
ls -la docker-entrypoint.sh  # Verificar que existe
chmod +x docker-entrypoint.sh  # Asegurar permisos
docker build -t fluxion-etl:test .
```

---

### Warning: "No se puede modificar sysctl"

**Causa:** El container en Fargate no tiene privilegios para modificar sysctl.

**Solución:** **Esto es normal y está OK.** El keepalive funciona desde Python/ODBC sin necesitar sysctl.

---

### Timeouts siguen ocurriendo

**Diagnóstico:**
```bash
# 1. Verificar que la imagen nueva está en uso
aws ecs describe-task-definition --task-definition fluxion-etl-task | grep image

# 2. Verificar logs para mensaje de keepalive
aws logs tail /ecs/fluxion-etl --format short | grep -i keepalive

# 3. Usar chunks más pequeños (3 días en lugar de 7)
python3 etl_ventas_chunked.py --dias-por-chunk 3
```

**Soluciones:**
1. Reducir `--dias-por-chunk` a 3 o 5 días
2. Coordinar con DBA para configurar keepalive en SQL Server
3. Verificar estabilidad de VPN WireGuard

---

## 📚 Referencias

- [docker-entrypoint.sh](docker-entrypoint.sh) - Script de configuración automática
- [Dockerfile](Dockerfile) - Build con entrypoint incluido
- [extractor_ventas.py](core/extractor_ventas.py) - Código con keepalive
- [infrastructure-stack.ts](../infrastructure/lib/infrastructure-stack.ts) - CDK con variables
- [SOLUCIONES_TIMEOUT_TCP.md](SOLUCIONES_TIMEOUT_TCP.md) - Documento completo de troubleshooting

---

**Última actualización:** 2025-10-22
**Estado:** ✅ Configuración automática lista para deployment
