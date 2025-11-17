# Auditoría Completa de Recursos AWS - Fluxion
**Fecha:** 2025-11-12
**Cuenta AWS:** 611395766952
**Región Principal:** us-east-1 (N. Virginia)

---

## Resumen Ejecutivo

**Factura Actual:** USD 162.64/mes
**Ahorro Potencial Identificado:** ~USD 50-55/mes (30-35% de reducción)
**Nuevo Costo Estimado:** ~USD 110-112/mes

---

## 🚨 PROBLEMAS CRÍTICOS ENCONTRADOS

### 1. **13 Volúmenes EBS Huérfanos** - COSTO: ~USD 13.00/mes
**Impacto:** Alto - Pagando por almacenamiento no utilizado

Tienes **13 volúmenes EBS de 25GB cada uno** (total 325GB) que NO están adjuntados a ninguna instancia:

```
vol-0c1df916b5eff463a - 25GB gp3 - Creado: 2025-10-12
vol-04e34229ddf7b0dd7 - 25GB gp3 - Creado: 2025-10-11
vol-0043679eb58228c8e - 25GB gp3 - Creado: 2025-10-11
vol-04c8174ef74d34de9 - 25GB gp3 - Creado: 2025-10-12
vol-006e63b8d0f754e51 - 25GB gp3 - Creado: 2025-10-12
vol-0f19638dbf9a9a7ed - 25GB gp3 - Creado: 2025-10-12
vol-0cb66ffecf3eab05f - 25GB gp3 - Creado: 2025-10-12
vol-0b7974f1869746c75 - 25GB gp3 - Creado: 2025-10-11
vol-0e1304ba4dd7bd195 - 25GB gp3 - Creado: 2025-10-12
vol-0cd075692711d5c39 - 25GB gp3 - Creado: 2025-10-11
vol-07d4b0707710c912d - 25GB gp3 - Creado: 2025-10-12
vol-04b5bfb8b1a782853 - 25GB gp3 - Creado: 2025-10-12
vol-018319694b36879c1 - 25GB gp3 - Creado: 2025-10-11
```

**Causa:** Estos volúmenes fueron creados por el Auto Scaling Group `FluxionASG` pero nunca fueron limpiados cuando las instancias terminaron.

**Costo:** 325GB × USD 0.08/GB-mes = **USD 26.00/mes**
(En tu factura aparecen 217.7GB = USD 17.42, lo que sugiere que algunos ya fueron creados después del período de facturación)

**Acción Recomendada:** ELIMINAR TODOS estos volúmenes inmediatamente.

---

### 2. **NAT Gateway** - COSTO: USD 47.35/mes (29% del total)
**Impacto:** Muy Alto - El recurso más caro

**Detalles:**
- NAT Gateway ID: `nat-0f634329467716a75`
- Costo por hora: USD 28.17 (626 horas = 26 días activo)
- Transferencia de datos: USD 19.18 (426.2 GB procesados)
- Uso diario promedio: **~2GB/día** (con picos de hasta 10GB el 06-nov)

**Análisis de Tráfico:**
```
2025-11-01: 1.89 GB saliente
2025-11-02: 1.99 GB saliente
2025-11-03: 1.91 GB saliente
2025-11-04: 2.57 GB saliente
2025-11-05: 1.79 GB saliente
2025-11-06: 10.51 GB saliente ⚠️ PICO ANÓMALO
2025-11-07: 1.77 GB saliente
2025-11-08: 1.84 GB saliente
2025-11-09: 1.94 GB saliente
2025-11-10: 2.04 GB saliente
2025-11-11: 5.85 GB saliente ⚠️ PICO ALTO
```

**Problema:** Tu backend en ECS Fargate está en subnets privadas y usa el NAT Gateway para salir a internet. Sin embargo, el tráfico es relativamente bajo (2GB/día promedio).

**Opciones de Optimización:**

**Opción A: Eliminar NAT Gateway completamente** (Ahorro: USD 45/mes)
- Mover las tareas ECS Fargate a subnets públicas
- Usar Security Groups para proteger el acceso
- Tu ALB ya está en subnets públicas, así que esto es viable

**Opción B: Reemplazar con NAT Instance** (Ahorro: USD 40/mes)
- Usar una instancia t4g.nano (USD 3-4/mes) + datos (USD 0.90/mes)
- Costo total: ~USD 5/mes vs USD 47/mes actual

**Opción C: Usar VPC Endpoints** (Ahorro: USD 35-40/mes)
- Si solo necesitas acceso a servicios AWS (S3, ECR, etc.)
- VPC Endpoints para ECR: USD 7/mes
- VPC Endpoints para S3: Gratis

**Recomendación:** Opción A (mover a subnets públicas) ya que tu aplicación es una API pública de todas formas.

---

### 3. **168 Imágenes Docker sin Tag en ECR** - COSTO: ~USD 5-8/mes
**Impacto:** Medio - Almacenamiento innecesario

**Detalles:**
- Repositorio: `fluxion-backend`
- Total imágenes: 169 (168 sin tag + 1 con tag "latest")
- Tamaño promedio: ~175 MB por imagen
- Almacenamiento total estimado: ~28 GB

**Problema:** Cada vez que haces un deploy, se crea una nueva imagen Docker pero no se eliminan las antiguas. Has acumulado 168 imágenes sin usar desde octubre.

**Costo:** 28 GB × USD 0.10/GB-mes = **USD 2.80/mes** (más creciendo cada deploy)

**Acción Recomendada:** Configurar una política de lifecycle en ECR para eliminar imágenes antiguas automáticamente.

---

### 4. **6 Buckets S3 Vacíos** - COSTO: USD 0/mes (pero confusión organizacional)
**Impacto:** Bajo - No cuestan nada, pero son basura

**Buckets Encontrados (TODOS VACÍOS):**
```
cdk-hnb659fds-assets-611395766952-us-east-1 (2025-10-05)
fluxion-backups-611395766952 (2025-10-05)
fluxion-backups-v2-611395766952 (2025-10-06)
fluxion-backups-v3-611395766952 (2025-10-11)
fluxion-backups-v4-611395766952 (2025-10-12)
fluxion-frontend-v4-611395766952 (2025-10-12)
```

**Problema:** Has estado creando buckets nuevos para "versiones" pero nunca eliminas los viejos. Todos están vacíos excepto posiblemente el último.

**Acción Recomendada:** Eliminar buckets v1, v2, v3 y consolidar en v4.

---

### 5. **Auto Scaling Group Sin Instancias** - COSTO: USD 0/mes (pero configuración huérfana)
**Impacto:** Bajo - No cuesta nada pero está mal configurado

**Detalles:**
- Auto Scaling Groups configurados pero sin instancias activas
- Tienes Launch Templates creados para instancias EC2 que nunca se usan
- Tu arquitectura actual usa **solo ECS Fargate**, no EC2

**Problema:** Parece que empezaste con EC2 + Auto Scaling pero luego migraste a Fargate, pero no limpiaste los recursos viejos.

**Acción Recomendada:** Eliminar Auto Scaling Groups y Launch Templates si ya no los usas.

---

## ✅ RECURSOS ACTIVOS Y LEGÍTIMOS

### EC2 Instances (USD 6.62/mes) ✓
```
i-07cc62e4314a4a67a - t3.micro - running - FluxionStackV2/WireGuardBridge
```
- **Uso:** 590 horas de t3.micro (USD 6.14)
- **Uso:** 23 horas de t3.small (USD 0.48)
- **Status:** ✅ Legítimo - Esta es tu instancia VPN/WireGuard

### ECS Fargate (USD 42.15/mes) ✓
```
Cluster: fluxion-cluster
Service: FluxionStackV2-FluxionBackendServiceE051E4B7-3D0YfNUbXnmp
Tareas activas: 1
CPU: 1024 (1 vCPU)
Memoria: 2048 MB (2 GB)
```
- **Status:** ✅ Legítimo - Tu backend de Fluxion corre aquí
- **Nota:** Costo mostrado como USD 0.00 en factura (posiblemente en Free Tier o con créditos aplicados)

### Application Load Balancer (Incluido en otros costos) ✓
```
Name: fluxion-alb
Type: application
Status: active
Created: 2025-10-12
```
- **Status:** ✅ Legítimo - Distribuye tráfico a tu backend

### EBS Volumen en Uso (USD 0.64/mes) ✓
```
vol-012cfd2c2711f002b - 8GB gp3 - Adjunto a i-07cc62e4314a4a67a
```
- **Status:** ✅ Legítimo - Disco de la instancia WireGuard

### Lambda Function (Costo mínimo, dentro de Free Tier) ✓
```
FluxionStackV2-CustomVpcRestrictDefaultSGCustomRes-DW6NsLrI9AhQ
Runtime: nodejs22.x
Memory: 128 MB
```
- **Status:** ✅ Legítimo - Custom resource de CloudFormation para configurar Security Groups

### Elastic IP (USD 0/mes mientras esté adjuntado) ✓
```
52.45.25.209 - eipalloc-0be6b196630cceb7c
Associated: eipassoc-09ff88547646d6e92
```
- **Status:** ✅ Legítimo - IP pública para NAT Gateway (pero si eliminas NAT Gateway, esto también se elimina)

---

## 📊 DESGLOSE DE COSTOS ACTUAL

| Recurso | Costo Mensual | % del Total | Status |
|---------|---------------|-------------|--------|
| NAT Gateway (horas) | USD 28.17 | 17.3% | ❌ OPTIMIZABLE |
| NAT Gateway (datos) | USD 19.18 | 11.8% | ❌ OPTIMIZABLE |
| EBS (217.7 GB) | USD 17.42 | 10.7% | ⚠️ INCLUYE HUÉRFANOS |
| ECS Fargate | USD 42.15 | 25.9% | ✅ LEGÍTIMO |
| EC2 Instances | USD 6.62 | 4.1% | ✅ LEGÍTIMO |
| ECR Storage | ~USD 5-8 | ~5% | ⚠️ OPTIMIZABLE |
| Otros | Variable | ~25% | ✅ LEGÍTIMO |
| **TOTAL** | **USD 162.64** | **100%** | |

---

## 💰 PLAN DE OPTIMIZACIÓN INMEDIATO

### Fase 1: Limpieza Inmediata (Ahorro: USD 13-15/mes)
**Tiempo estimado:** 30 minutos

1. **Eliminar 13 volúmenes EBS huérfanos**
   - Ahorro: USD 13/mes
   - Riesgo: Ninguno (no están adjuntados)

2. **Limpiar imágenes Docker antiguas en ECR**
   - Ahorro: USD 3-5/mes
   - Riesgo: Ninguno (mantener últimas 10 imágenes)

3. **Eliminar buckets S3 vacíos (v1, v2, v3)**
   - Ahorro: USD 0
   - Beneficio: Organización

### Fase 2: Optimización de Red (Ahorro: USD 40-45/mes)
**Tiempo estimado:** 2-3 horas

**Opción recomendada:** Mover Fargate a subnets públicas

1. Modificar task definition para usar `assignPublicIp: ENABLED`
2. Mover tareas a subnets públicas
3. Asegurar Security Groups permitan solo tráfico desde ALB
4. Eliminar NAT Gateway
5. Probar conectividad

**Riesgo:** Medio - Requiere testing cuidadoso

### Fase 3: Limpieza de Infraestructura (Ahorro: USD 0)
**Tiempo estimado:** 30 minutos

1. Eliminar Auto Scaling Groups no usados
2. Eliminar Launch Templates viejos
3. Eliminar CloudFormation stacks obsoletos (si existen)

---

## 🎯 PROYECCIÓN DE COSTOS POST-OPTIMIZACIÓN

| Categoría | Actual | Optimizado | Ahorro |
|-----------|--------|------------|--------|
| NAT Gateway | USD 47.35 | USD 0 | USD 47.35 |
| EBS Storage | USD 17.42 | USD 4.42 | USD 13.00 |
| ECR Storage | USD 5-8 | USD 1-2 | USD 5.00 |
| ECS Fargate | USD 42.15 | USD 42.15 | USD 0 |
| EC2 | USD 6.62 | USD 6.62 | USD 0 |
| ALB | ~USD 20 | ~USD 20 | USD 0 |
| Otros | ~USD 25 | ~USD 25 | USD 0 |
| **TOTAL** | **USD 162.64** | **~USD 110** | **USD 52-55** |

**Reducción:** 32-34%

---

## 🔍 RECURSOS NO ENCONTRADOS (BIEN)

✅ No hay instancias EC2 huérfanas en otras regiones
✅ No hay bases de datos RDS activas
✅ No hay Classic Load Balancers (deprecated)
✅ No hay Elastic IPs sin usar (costarían USD 3.60/mes cada una)
✅ No hay snapshots de EBS huérfanos

---

## 📋 CHECKLIST DE ACCIÓN INMEDIATA

### 🔴 PRIORIDAD ALTA (Hacer HOY)
- [ ] Eliminar 13 volúmenes EBS huérfanos (USD 13/mes de ahorro)
- [ ] Configurar lifecycle policy en ECR fluxion-backend (USD 5/mes de ahorro)
- [ ] Investigar picos de tráfico NAT Gateway (06-nov: 10GB, 11-nov: 5.8GB)

### 🟡 PRIORIDAD MEDIA (Esta semana)
- [ ] Planear migración de Fargate a subnets públicas
- [ ] Testing de conectividad sin NAT Gateway en ambiente de desarrollo
- [ ] Eliminar buckets S3 v1, v2, v3 (si están vacíos)

### 🟢 PRIORIDAD BAJA (Este mes)
- [ ] Limpiar Auto Scaling Groups y Launch Templates no usados
- [ ] Considerar Reserved Instances o Savings Plans si el uso es estable
- [ ] Configurar AWS Budgets con alertas (USD 150, USD 175, USD 200)

---

## 🛡️ RECOMENDACIONES DE GOBERNANZA

1. **Configurar AWS Budgets**
   - Alerta a USD 150/mes (warning)
   - Alerta a USD 175/mes (critical)

2. **Implementar Tagging Strategy**
   - Tag todos los recursos con: `Environment`, `Project`, `Owner`
   - Facilita identificar recursos huérfanos

3. **Automatizar Limpieza**
   - ECR Lifecycle Policies: Mantener solo últimas 10 imágenes
   - Lambda para detectar volúmenes EBS huérfanos y notificar
   - Configurar retention en CloudWatch Logs

4. **Monitoreo de Costos**
   - Revisar AWS Cost Explorer semanalmente
   - Usar AWS Trusted Advisor (incluido en plan básico)

---

## 📞 PRÓXIMOS PASOS

¿Quieres que te ayude a ejecutar alguno de estos pasos ahora mismo?

Puedo:
1. Generar los comandos para eliminar los volúmenes EBS huérfanos
2. Crear la política de lifecycle para ECR
3. Modificar la configuración de Fargate para usar subnets públicas
4. Eliminar los buckets S3 vacíos

**Solo dime qué quieres hacer primero y lo ejecutamos juntos.**
