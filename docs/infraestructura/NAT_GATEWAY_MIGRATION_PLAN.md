# Plan de Eliminación de NAT Gateway
**Ahorro Proyectado:** USD 47/mes
**Fecha de Análisis:** 2025-11-12

---

## 🔍 Arquitectura Actual Detectada

### VPC: vpc-0612cd85dfc5a044f (10.0.0.0/16)

**Subnets Públicas (con Internet Gateway):**
```
subnet-0f010c2676fb194d9 - 10.0.0.0/24 - PublicSubnet1 (us-east-1a)
subnet-0cef3575e7ade7db8 - 10.0.1.0/24 - PublicSubnet2 (us-east-1b)
```

**Subnets Privadas (con NAT Gateway):**
```
subnet-0c25527960967df9e - 10.0.2.0/24 - PrivateSubnet1 (us-east-1a)
subnet-0d4e5b3576dfb907f - 10.0.3.0/24 - PrivateSubnet2 (us-east-1b)
```

### Recursos Actuales

**1. WireGuard VPN Bridge**
- Instance ID: `i-07cc62e4314a4a67a` (t3.micro)
- Subnet: `subnet-0c25527960967df9e` (PrivateSubnet1)
- IP Privada: `10.0.2.90`
- IP Pública: **NINGUNA** (depende del NAT Gateway)
- Security Group: `sg-075e1642f0e98fac2`
  - Permite todo el tráfico desde `10.0.0.0/16` (interno VPC)

**2. ECS Fargate Backend**
- Cluster: `fluxion-cluster`
- Service: `FluxionStackV2-FluxionBackendServiceE051E4B7-3D0YfNUbXnmp`
- Subnets: `subnet-0c25527960967df9e`, `subnet-0d4e5b3576dfb907f` (Privadas)
- Security Group: `sg-0c76c8b922863e876`
- Tareas: 1 activa (CPU: 1024, RAM: 2048MB)

**3. Application Load Balancer**
- Name: `fluxion-alb`
- Subnets: **PÚBLICAS** (correctamente configurado)
- Enruta tráfico → Backend en subnets privadas

**4. NAT Gateway**
- ID: `nat-0f634329467716a75`
- Subnet: `subnet-0f010c2676fb194d9` (PublicSubnet1)
- Elastic IP: `52.45.25.209`
- Tráfico promedio: **2GB/día** (~60GB/mes)

### Routing Actual

**Private Subnets → NAT Gateway:**
```
PrivateSubnet1 (rtb-0312a5cba22e2c85f):
  10.0.0.0/16 → local (VPC interno)
  192.168.0.0/16 → ??? (ruta misteriosa, posiblemente VPN)
  0.0.0.0/0 → nat-0f634329467716a75 (Internet via NAT)

PrivateSubnet2 (rtb-0742d6f57b5b7f2e0):
  10.0.0.0/16 → local (VPC interno)
  192.168.0.0/16 → ??? (ruta misteriosa, posiblemente VPN)
  0.0.0.0/0 → nat-0f634329467716a75 (Internet via NAT)
```

**Public Subnets → Internet Gateway:**
```
PublicSubnet1 (rtb-0a6452c458a9976db):
  10.0.0.0/16 → local
  0.0.0.0/0 → igw-0a47e5bc2585312d2 (Internet directo)

PublicSubnet2 (rtb-09e934e5a00f0ffd4):
  10.0.0.0/16 → local
  0.0.0.0/0 → igw-0a47e5bc2585312d2 (Internet directo)
```

---

## 🚨 HALLAZGO CRÍTICO: Ruta 192.168.0.0/16

**Problema:** Ambas subnets privadas tienen una ruta a `192.168.0.0/16` que NO tiene gateway/target definido.

**Posibles Causas:**
1. **VPN Site-to-Site:** Conecta tu VPC con una red on-premise 192.168.0.0/16
2. **VPN Client (WireGuard):** La instancia WireGuard actúa como gateway a 192.168.0.0/16
3. **Ruta huérfana:** Configuración antigua que ya no se usa

**Acción Requerida:** Necesitamos investigar para qué sirve esta ruta antes de modificar la arquitectura.

---

## 🎯 ¿Por Qué Necesitas el NAT Gateway?

Basado en el análisis, estos son los motivos posibles:

### 1. **ECS Fargate necesita salir a internet** (Probable)
Para:
- Descargar imágenes Docker desde ECR
- Acceder a servicios externos (APIs, bases de datos remotas, etc.)
- Actualizaciones del sistema

### 2. **WireGuard necesita conexión saliente** (Probable)
Para:
- Establecer túneles VPN con clientes externos
- Comunicarse con la red 192.168.0.0/16 (si es una VPN site-to-site)

### 3. **Seguridad por diseño** (Tu comentario)
Mencionaste que era "lo más fácil" para la VPN, sugiriendo que pusiste todo en subnets privadas por seguridad.

---

## 📊 Análisis de Tráfico NAT Gateway

**Uso Diario:**
```
2025-11-01: 1.89 GB
2025-11-02: 1.99 GB
2025-11-03: 1.91 GB
2025-11-04: 2.57 GB
2025-11-05: 1.79 GB
2025-11-06: 10.51 GB ⚠️ PICO ANÓMALO
2025-11-07: 1.77 GB
2025-11-08: 1.84 GB
2025-11-09: 1.94 GB
2025-11-10: 2.04 GB
2025-11-11: 5.85 GB ⚠️ PICO ALTO
```

**Promedio:** 2GB/día (~60GB/mes)
**Picos:** 06-nov (10.5GB) y 11-nov (5.8GB)

**Pregunta Clave:** ¿Qué pasó el 06-nov y 11-nov? Posiblemente:
- Backup de base de datos
- Deploy grande
- ETL que procesa muchos datos
- Actualizaciones masivas

---

## 🎯 Estrategias de Eliminación del NAT Gateway

### **Estrategia 1: Mover TODO a Subnets Públicas** ⭐ RECOMENDADA
**Ahorro:** USD 47/mes
**Complejidad:** Media
**Riesgo:** Medio

**Pasos:**
1. Mover tareas ECS Fargate a subnets públicas
2. Mover instancia WireGuard a subnet pública
3. Asegurar con Security Groups estrictos
4. Configurar Elastic IP para WireGuard (si necesita IP fija)
5. Eliminar NAT Gateway

**Pros:**
- Ahorro máximo (USD 47/mes)
- Simplicidad: Internet Gateway es gratis
- Menor latencia (sin NAT en el medio)

**Contras:**
- Requiere reconfiguración de servicios
- IPs públicas expuestas (mitigado con Security Groups)
- WireGuard necesitará Elastic IP (USD 0/mes si está adjuntado)

**Cambios Necesarios:**
```bash
# 1. Modificar ECS Service para usar subnets públicas
# 2. Modificar WireGuard instance para subnet pública + Elastic IP
# 3. Ajustar Security Groups
# 4. Eliminar rutas a NAT Gateway
# 5. Eliminar NAT Gateway
```

---

### **Estrategia 2: VPC Endpoints para Servicios AWS**
**Ahorro:** USD 35-40/mes
**Complejidad:** Media
**Riesgo:** Bajo

**Si tu tráfico es SOLO a servicios AWS (ECR, S3, etc.), puedes:**

1. Crear VPC Endpoint para ECR (USD 7/mes)
2. Crear VPC Endpoint para S3 (Gratis - Gateway endpoint)
3. Mantener NAT Gateway solo para tráfico externo no-AWS
4. Reducir costo de datos procesados (de USD 19 a ~USD 3)

**Pros:**
- Mantiene arquitectura actual
- Menor riesgo de romper cosas
- Mejor performance (tráfico interno AWS)

**Contras:**
- Ahorro menor
- Aún pagas ~USD 30/mes por NAT Gateway (horas)
- Complejidad adicional

**Endpoints Recomendados:**
```
com.amazonaws.us-east-1.ecr.api (USD 7/mes)
com.amazonaws.us-east-1.ecr.dkr (USD 7/mes)
com.amazonaws.us-east-1.s3 (Gratis - Gateway)
```

---

### **Estrategia 3: Reemplazar con NAT Instance (t4g.nano)**
**Ahorro:** USD 42/mes
**Complejidad:** Alta
**Riesgo:** Medio-Alto

**Reemplazar NAT Gateway con una instancia EC2 pequeña:**

1. Lanzar t4g.nano (ARM) en subnet pública (USD 3/mes)
2. Configurar IP forwarding y iptables
3. Actualizar route tables para apuntar a la instancia
4. Eliminar NAT Gateway

**Pros:**
- Ahorro casi total (USD 42/mes)
- Mantiene arquitectura de subnets privadas
- Control total sobre NAT

**Contras:**
- Requiere mantenimiento (actualizaciones, monitoring)
- Punto único de falla (sin alta disponibilidad)
- Performance limitada (t4g.nano = 2 vCPU, 512MB RAM)
- Complejidad operacional

---

### **Estrategia 4: Arquitectura Híbrida** 💡 ÓPTIMA
**Ahorro:** USD 47/mes
**Complejidad:** Media-Alta
**Riesgo:** Bajo-Medio

**Solución más elegante:**

1. **ECS Fargate → Subnets Públicas**
   - Tu backend es una API pública de todas formas
   - El ALB ya está público
   - Security Groups protegen el acceso
   - No necesita NAT

2. **WireGuard → Subnet Pública + Elastic IP**
   - VPN necesita IP pública fija para clientes
   - No tiene sentido tenerlo detrás de NAT
   - Elastic IP sin cargo si está adjuntado

3. **Eliminar NAT Gateway completamente**

**Pros:**
- Ahorro máximo
- Arquitectura más limpia
- Cada servicio donde debe estar
- Menor latencia

**Contras:**
- Requiere planificación cuidadosa
- Testing exhaustivo
- Downtime mínimo durante migración

---

## 🔑 Preguntas Críticas Antes de Decidir

### 1. ¿Para qué usas la ruta 192.168.0.0/16?
- [ ] VPN site-to-site a red corporativa
- [ ] Clientes VPN que se conectan a WireGuard
- [ ] No sé / No la uso
- [ ] Otra razón: ___________

### 2. ¿Tu backend necesita acceder a servicios externos (no-AWS)?
- [ ] Sí - APIs de terceros (¿cuáles?)
- [ ] Sí - Bases de datos externas
- [ ] No - Solo servicios AWS (ECR, S3)
- [ ] No estoy seguro

### 3. ¿WireGuard recibe conexiones de clientes externos?
- [ ] Sí - Clientes se conectan desde internet
- [ ] Sí - Túnel permanente a otra red
- [ ] No - Solo para pruebas
- [ ] No estoy seguro

### 4. ¿Qué pasó el 06-nov y 11-nov (picos de tráfico)?
- [ ] Backup de base de datos
- [ ] Deploy o migración
- [ ] ETL procesando datos
- [ ] No sé / No recuerdo

### 5. ¿Cuál es tu tolerancia a downtime?
- [ ] 0 minutos (producción crítica)
- [ ] 15-30 minutos (horario de baja demanda)
- [ ] 1-2 horas (tengo ventana de mantenimiento)
- [ ] Ambiente de desarrollo (no importa)

---

## 🛠️ Recomendación Final

**Basado en el análisis, recomiendo la Estrategia 4 (Híbrida):**

### Fase 1: Preparación (Sin downtime)
1. ✅ Identificar todos los servicios que usan el NAT Gateway
2. ✅ Verificar que ECR tenga todas las imágenes necesarias
3. ✅ Documentar configuración actual (ya hecho)
4. ⏳ **Responder preguntas críticas arriba**

### Fase 2: Migración de WireGuard (Downtime: ~5 min)
1. Crear Elastic IP
2. Detener instancia WireGuard
3. Mover a subnet pública
4. Asociar Elastic IP
5. Actualizar Security Group para permitir WireGuard port desde internet
6. Iniciar instancia
7. Testing de conectividad VPN

### Fase 3: Migración de ECS Fargate (Downtime: ~10-15 min)
1. Crear nueva Task Definition con `assignPublicIp: ENABLED`
2. Actualizar ECS Service para usar subnets públicas
3. Esperar a que nuevas tareas levanten
4. Verificar que ALB enrute correctamente
5. Terminar tareas viejas

### Fase 4: Eliminación de NAT Gateway (Sin downtime)
1. Actualizar route tables (eliminar rutas a NAT)
2. Esperar 24 horas (monitoreo)
3. Eliminar NAT Gateway
4. Liberar Elastic IP del NAT (si aplica)

### Fase 5: Validación (1 semana)
1. Monitorear conectividad
2. Verificar que no haya errores en logs
3. Confirmar que VPN funciona correctamente
4. Validar que backend responde correctamente

**Ahorro Total Estimado:** USD 47/mes
**Tiempo Total:** 2-3 horas de trabajo técnico
**Downtime Total:** 15-20 minutos máximo

---

## 🚦 Próximo Paso

**ACCIÓN REQUERIDA:** Responde las 5 preguntas críticas para poder elaborar el plan de migración específico.

Una vez que entienda tu caso de uso exacto (especialmente la ruta 192.168.0.0/16 y el propósito de WireGuard), podré darte el plan paso a paso exacto para ejecutar.

¿Quieres que investigue más sobre algún aspecto específico antes de decidir?
