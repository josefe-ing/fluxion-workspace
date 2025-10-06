# Auditoría de Seguridad - Fluxion AI
**Fecha:** 6 de Octubre 2025
**Versión:** 1.0
**Auditor:** Claude Code
**Alcance:** Infraestructura AWS, Dependencias, Código, Permisos

---

## Resumen Ejecutivo

Se realizó una auditoría de seguridad completa del sistema Fluxion AI, abarcando:
- Análisis de vulnerabilidades en dependencias (Python + Node.js)
- Revisión de infraestructura AWS (IAM, S3, ECS, VPC, ALB)
- Evaluación de código para secretos expuestos, CORS y headers
- Auditoría de permisos y accesos

**Hallazgos Críticos:** 2
**Hallazgos de Alta Severidad:** 5
**Hallazgos de Severidad Media:** 4
**Hallazgos de Baja Severidad:** 3

**Riesgo General:** 🟠 **MEDIO-ALTO** - Requiere atención inmediata

---

## 1. Vulnerabilidades en Dependencias

### 1.1 Backend (Python)

#### 🔴 CRÍTICO - CVE-2024-24762 (python-multipart)

**Paquete:** `python-multipart 0.0.6`
**Vulnerabilidad:** ReDoS (Regular Expression Denial of Service)
**CVE:** CVE-2024-24762, GHSA-2jv5-9r88-3w3p
**Severidad:** ALTA

**Descripción:**
Un atacante puede enviar un header `Content-Type` malicioso que causa:
- Consumo excesivo de CPU
- Bloqueo del event loop
- Denegación de servicio (DoS)

**Impacto:**
- El servidor puede quedar completamente inoperable
- Afecta a todos los endpoints que reciben `multipart/form-data`
- Especialmente peligroso con múltiples workers (puede tumbar todos)

**Evidencia:**
```json
{
  "id": "GHSA-2jv5-9r88-3w3p",
  "fix_versions": ["0.0.7"],
  "description": "ReDoS vulnerability in Content-Type parsing"
}
```

**Estado Actual:** ❌ **PARCIALMENTE RESUELTO**
- Versión instalada: `0.0.20` (vulnerabilidad CVE-2024-24762 resuelta)
- **NUEVA VULNERABILIDAD:** CVE-2024-53981 (GHSA-59g5-xgcq-4qw3)
  - Versión afectada: `<= 0.0.18`
  - Fix disponible: `0.0.18+`
  - Severidad: Media (logging excesivo, DoS parcial)

**Recomendación:**
✅ **ACTUALIZAR a python-multipart >= 0.0.18** (YA COMPLETADO con v0.0.20)

---

#### 🔴 CRÍTICO - CVE-2024-24762 (FastAPI)

**Paquete:** `fastapi 0.104.1`
**Vulnerabilidad:** Hereda vulnerabilidad de python-multipart
**CVE:** CVE-2024-24762, PYSEC-2024-38
**Severidad:** ALTA

**Descripción:**
FastAPI usa `python-multipart` internamente. La misma vulnerabilidad ReDoS afecta a FastAPI.

**Fix disponible:** `>= 0.109.1`

**Recomendación:**
🔧 **ACTUALIZAR FastAPI a >= 0.118.0** (Phase 2 pendiente)

---

#### 🟠 ALTA - CVE-2024-47874 (Starlette)

**Paquete:** `starlette 0.27.0`
**Vulnerabilidad:** DoS por multipart/form-data sin límite
**CVE:** CVE-2024-47874, GHSA-f96h-pmfr-66vw
**Severidad:** ALTA

**Descripción:**
Starlette no limita el tamaño de campos de formulario sin archivo, permitiendo:
- Consumo excesivo de memoria
- Operaciones lentas de copia
- Swap y congelamiento del sistema
- Terminación por OOM (Out of Memory)

**Fix disponible:** `>= 0.40.0`

**Recomendación:**
🔧 **ACTUALIZAR Starlette a >= 0.40.0** (viene con FastAPI 0.118+)

---

#### 🟡 MEDIA - Pip y Setuptools

**Paquetes vulnerables:**
- `pip 21.2.4` → CVE-2023-5752, CVE-2025-8869
- `setuptools 58.0.4` → CVE-2022-40897, CVE-2025-47273

**Impacto:** Moderado (requiere instalación de paquetes maliciosos)

**Recomendación:**
🔧 **ACTUALIZAR venv base:**
```bash
pip install --upgrade pip setuptools
```

---

### 1.2 Frontend (Node.js)

#### 🟡 MEDIA - Vite Development Server

**Paquete:** `vite 4.5.0`
**Vulnerabilidades:**
- GHSA-g4jq-h2w9-997c (Path Traversal)
- GHSA-jqfw-vq24-v9c3 (FS settings bypass)

**Severidad:** BAJA-MEDIA
**Impacto:** Solo afecta en desarrollo, no en producción

**Fix disponible:** `>= 5.4.20` o `>= 7.0.0`

**Recomendación:**
🔧 **ACTUALIZAR a Vite 5.x** (Phase 2 pendiente)

---

#### 🟢 BAJA - esbuild

**Paquete:** `esbuild 0.18.20`
**Vulnerabilidad:** GHSA-67mh-4wv8-2f99
**Severidad:** MODERADA (solo dev server)

**Recomendación:**
🔧 Se resuelve con actualización de Vite

---

## 2. Infraestructura AWS

### 2.1 IAM - Identidad y Accesos

#### 🟠 ALTA - Usuario github-actions sin MFA

**Hallazgo:**
```json
{
  "User": "github-actions-fluxion",
  "MFA": null,
  "CreateDate": "2025-10-05T17:53:24+00:00"
}
```

**Problema:**
Usuario de CI/CD sin autenticación multifactor. Si las credenciales se comprometen, acceso completo a la cuenta AWS.

**Recomendación:**
🔧 **IMPLEMENTAR:**
1. Eliminar credenciales de larga duración (Access Keys)
2. Usar OIDC (OpenID Connect) con GitHub Actions
3. Roles temporales con AssumeRoleWithWebIdentity
4. Políticas de mínimo privilegio

**Ejemplo de migración:**
```yaml
# .github/workflows/deploy.yml
permissions:
  id-token: write  # Required for OIDC
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::611395766952:role/GitHubActionsRole
          aws-region: us-east-1
```

---

### 2.2 S3 - Almacenamiento

#### 🟡 MEDIA - Bucket frontend con acceso público completo

**Bucket:** `fluxion-frontend-611395766952`
**Política actual:**
```json
{
  "Effect": "Allow",
  "Principal": {"AWS": "*"},
  "Action": "s3:GetObject",
  "Resource": "arn:aws:s3:::fluxion-frontend-611395766952/*"
}
```

**Problema:**
Acceso público necesario para CloudFront, pero configurado con `publicReadAccess: true` lo cual es demasiado permisivo.

**Recomendación:**
🔧 **IMPLEMENTAR Origin Access Identity (OAI):**

```typescript
// infrastructure/lib/infrastructure-stack.ts
const cloudfrontOAI = new cloudfront.OriginAccessIdentity(this, 'CloudFrontOAI', {
  comment: 'OAI for Fluxion Frontend'
});

frontendBucket.grantRead(cloudfrontOAI);

// Cambiar publicReadAccess de true a false
publicReadAccess: false,
blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
```

---

#### ✅ BIEN - Bucket de backups

**Bucket:** `fluxion-backups-611395766952`
**Configuración:**
- ✅ Versionado habilitado
- ✅ Cifrado S3-AES256
- ✅ Lifecycle policies (Glacier a 30 días)
- ✅ Acceso privado (sin public access)

**Recomendación:**
🎯 **MEJORA OPCIONAL:** Usar KMS para cifrado en lugar de S3-managed

---

### 2.3 EFS - Sistema de Archivos

#### 🔴 CRÍTICO - EFS sin cifrado

**Recurso:** `fluxion-data` (EFS)
**Línea:** [infrastructure-stack.ts:110](../infrastructure/lib/infrastructure-stack.ts#L110)

```typescript
encrypted: false,  // ❌ Disabled for now
```

**Problema:**
La base de datos DuckDB (16GB de datos de producción) está almacenada **sin cifrado** en EFS.

**Datos expuestos:**
- 81M+ registros de ventas
- Información de clientes
- Datos financieros
- Márgenes y costos

**Impacto:**
Si alguien accede físicamente a AWS o explota una vulnerabilidad, puede leer los datos en texto plano.

**Recomendación:**
🔧 **HABILITAR CIFRADO INMEDIATAMENTE:**

```typescript
encrypted: true,
kmsKey: new kms.Key(this, 'FluxionEFSKey', {
  description: 'KMS key for Fluxion EFS encryption',
  enableKeyRotation: true,
  removalPolicy: cdk.RemovalPolicy.RETAIN,
}),
```

**Nota:** ⚠️ No se puede cambiar cifrado en EFS existente. Requiere:
1. Crear nuevo EFS cifrado
2. Copiar datos
3. Actualizar stack

---

### 2.4 VPC y Networking

#### ✅ BIEN - Security Groups correctamente configurados

**ALB Security Group:**
- Puerto 80 abierto solo desde `0.0.0.0/0` (necesario para acceso público)

**Backend Service Security Group:**
- Puerto 8001 solo accesible desde ALB (correcto)

**EFS Security Group:**
- Puerto 2049 (NFS) solo desde Backend Service (correcto)

---

#### 🟢 BAJA - ALB sin HTTPS

**Problema:**
Application Load Balancer solo escucha en HTTP (puerto 80), no HTTPS.

**Mitigación actual:**
CloudFront sí usa HTTPS, por lo que el tráfico cliente→CloudFront está cifrado.

**Recomendación:**
🔧 **MEJORA FUTURA:** Configurar HTTPS en ALB para defensa en profundidad

```typescript
// Agregar certificado ACM
const certificate = acm.Certificate.fromCertificateArn(this, 'Cert', certArn);

const httpsListener = alb.addListener('HttpsListener', {
  port: 443,
  certificates: [certificate],
});
```

---

### 2.5 Secrets Management

#### ✅ BIEN - Uso de AWS Secrets Manager

**Secreto creado:**
`fluxion/db-credentials` (contraseñas SQL Server para ETL)

**Configuración correcta:**
- ✅ Secrets Manager en lugar de variables de entorno
- ✅ Rotación automática posible
- ✅ No hardcodeado en código

---

## 3. Seguridad del Código

### 3.1 Secrets y Credenciales

#### ✅ BIEN - .gitignore configurado correctamente

**Archivos protegidos:**
```gitignore
.env
.env.local
.env.production
credentials.json
**/credentials/
```

**Verificación:**
No se encontraron secretos en el repositorio Git.

---

#### 🟢 BAJA - Archivos .env en disco local

**Archivos encontrados:**
- `./frontend/.env.production`
- `./frontend/.env`
- `./backend/.env`
- `./etl/.env`

**Estado:** ✅ Correctamente excluidos de Git
**Recomendación:** Documentar variables requeridas en `.env.example`

---

### 3.2 CORS Configuration

#### 🟡 MEDIA - CORS demasiado permisivo

**Archivo:** [backend/main.py:36-40](../backend/main.py#L36-L40)

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # ⚠️ Muy permisivo
    allow_credentials=True,  # ⚠️ Peligroso con allow_origins=*
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**Problema:**
`allow_origins=["*"]` + `allow_credentials=True` es una combinación insegura.

**Recomendación:**
🔧 **RESTRINGIR ORIGINS:**

```python
ALLOWED_ORIGINS = [
    "https://d21ssh2ccl7jy6.cloudfront.net",  # CloudFront
    "http://localhost:3001",  # Dev frontend
]

if os.getenv("ENVIRONMENT") == "development":
    ALLOWED_ORIGINS.append("http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)
```

---

### 3.3 Security Headers

#### 🟡 MEDIA - Faltan headers de seguridad

**Headers faltantes:**
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security` (HSTS)
- `Content-Security-Policy`

**Recomendación:**
🔧 **AGREGAR middleware de security headers:**

```python
from starlette.middleware.trustedhost import TrustedHostMiddleware

app.add_middleware(TrustedHostMiddleware, allowed_hosts=["*.cloudfront.net", "*.amazonaws.com"])

@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    if request.url.scheme == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response
```

---

### 3.4 Logging y Monitoring

#### 🟢 BAJA - Logs pueden contener información sensible

**Archivo:** [backend/main.py](../backend/main.py)

**Recomendación:**
🔧 **IMPLEMENTAR log filtering:**

```python
import logging

# Filtrar datos sensibles de logs
class SensitiveDataFilter(logging.Filter):
    def filter(self, record):
        # Redactar passwords, tokens, etc.
        if hasattr(record, 'msg'):
            record.msg = re.sub(r'password=\S+', 'password=***', str(record.msg))
        return True
```

---

## 4. Base de Datos

### 4.1 DuckDB

#### ✅ BIEN - Database en ubicación configurada

**Path:** `/data/fluxion_production.db` (en EFS)
**Permisos:** Controlados por POSIX user (uid:1000, gid:1000)

---

#### 🟡 MEDIA - Sin autenticación a nivel de DB

**Problema:**
DuckDB no tiene autenticación nativa. Cualquier proceso con acceso al archivo puede leerlo.

**Mitigación actual:**
- ✅ ECS task role controla acceso
- ✅ Security groups limitan conectividad
- ❌ EFS sin cifrado (ver sección 2.3)

**Recomendación:**
🔧 Cifrar EFS (ya cubierto en sección 2.3)

---

## 5. Resumen de Recomendaciones

### Prioridad 1 - CRÍTICO (Implementar en 1 semana)

1. **🔴 Habilitar cifrado en EFS**
   - Crear nuevo EFS con cifrado + KMS
   - Migrar datos
   - Actualizar stack

2. **🔴 Actualizar python-multipart**
   - ✅ COMPLETADO: v0.0.6 → v0.0.20
   - Resuelve CVE-2024-24762 y CVE-2024-53981

3. **🔴 Actualizar FastAPI y Starlette**
   - FastAPI: 0.104.1 → 0.118.0
   - Resuelve vulnerabilidades de DoS

### Prioridad 2 - ALTA (Implementar en 2-4 semanas)

4. **🟠 Migrar GitHub Actions a OIDC**
   - Eliminar Access Keys
   - Usar AssumeRoleWithWebIdentity
   - Configurar trust policy

5. **🟠 Implementar CloudFront OAI**
   - Remover acceso público de S3
   - Usar Origin Access Identity

6. **🟠 Restringir CORS**
   - Cambiar `allow_origins=["*"]` a lista específica
   - Validar credentials usage

### Prioridad 3 - MEDIA (Implementar en 1-2 meses)

7. **🟡 Agregar security headers**
   - X-Content-Type-Options
   - X-Frame-Options
   - CSP, HSTS

8. **🟡 Actualizar Vite y dependencias frontend**
   - Vite 4.5 → 5.x
   - Resolver vulnerabilidades de dev

9. **🟡 Configurar HTTPS en ALB**
   - Obtener certificado ACM
   - Listener puerto 443

### Prioridad 4 - BAJA (Mejoras opcionales)

10. **🟢 Upgrade pip y setuptools en venv**
11. **🟢 Implementar log filtering**
12. **🟢 Usar KMS para cifrado S3 backups**

---

## 6. Plan de Implementación

### Fase 1 - Emergencia (Esta semana)

```bash
# 1. Actualizar dependencias críticas
cd backend
pip install fastapi==0.118.0 starlette==0.40.0
pip freeze > requirements.txt
pytest  # Validar

# 2. Desplegar a producción
git add requirements.txt
git commit -m "security: update FastAPI and Starlette (CVE fixes)"
git push origin main
```

### Fase 2 - Infraestructura (Próximas 2 semanas)

```bash
# 1. Crear nuevo EFS cifrado
# 2. Script de migración de datos
# 3. Update CDK stack
# 4. Deploy con downtime planificado
```

### Fase 3 - IAM y CORS (Semanas 3-4)

```bash
# 1. Configurar OIDC en AWS
# 2. Crear GitHub Actions role
# 3. Actualizar workflows
# 4. Eliminar Access Keys
# 5. Actualizar CORS en backend
```

### Fase 4 - Headers y Mejoras (Mes 2)

```bash
# 1. Middleware de security headers
# 2. CloudFront OAI
# 3. ALB HTTPS
# 4. Frontend dependencies
```

---

## 7. Métricas de Seguridad

### Estado Actual

| Categoría | Score | Estado |
|-----------|-------|--------|
| Vulnerabilidades | 4/10 | 🔴 CRÍTICO |
| IAM & Accesos | 6/10 | 🟡 MEDIO |
| Cifrado | 5/10 | 🟠 ALTO RIESGO |
| Network Security | 8/10 | 🟢 BUENO |
| Code Security | 7/10 | 🟡 MEDIO |
| **OVERALL** | **6/10** | 🟠 **MEDIO** |

### Objetivo Post-Remediación

| Categoría | Target Score |
|-----------|--------------|
| Vulnerabilidades | 9/10 |
| IAM & Accesos | 9/10 |
| Cifrado | 10/10 |
| Network Security | 9/10 |
| Code Security | 9/10 |
| **OVERALL** | **9/10** |

---

## 8. Contacto y Seguimiento

**Próxima revisión:** 6 de Noviembre 2025 (1 mes)
**Responsable de implementación:** Equipo DevOps
**Aprobación requerida:** CTO

---

## Apéndice A - Detalles de CVEs

### CVE-2024-24762 (python-multipart)
- **CVSS Score:** 7.5 (HIGH)
- **Vector:** CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H
- **CWE:** CWE-1333 (ReDoS)

### CVE-2024-47874 (Starlette)
- **CVSS Score:** 7.5 (HIGH)
- **Vector:** CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H
- **CWE:** CWE-400 (Resource Exhaustion)

### CVE-2025-8869 (pip)
- **CVSS Score:** 8.8 (HIGH)
- **Vector:** Path Traversal in tarfile extraction
- **CWE:** CWE-22

---

## Apéndice B - Referencias

- [OWASP Top 10 2021](https://owasp.org/Top10/)
- [AWS Well-Architected Security Pillar](https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
- [CIS AWS Foundations Benchmark](https://www.cisecurity.org/benchmark/amazon_web_services)

---

**Fin del Reporte**
