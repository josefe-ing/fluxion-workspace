# Fluxion AI - Estado del Sistema v2.0

> Documento de referencia para el estado actual del sistema de gestión de inventario.
> Última actualización: 24 Nov 2025

---

## 1. Resumen Ejecutivo

**Fluxion AI** es un sistema de gestión de inventario con inteligencia artificial para **La Granja Mercado**, un distribuidor mayorista B2B en Venezuela.

### Stack Tecnológico
| Capa | Tecnología |
|------|------------|
| Frontend | React 18 + TypeScript + Vite + TailwindCSS |
| Backend | Python 3.14 + FastAPI 0.119+ |
| Base de Datos | DuckDB (OLAP, 16GB+, 81M+ registros) |
| ETL | Python scripts con conexión a SQL Server (Stellar/KLK) |

---

## 2. Features Implementados (QUÉ HACEMOS)

### 2.1 Clasificación ABC (Análisis Pareto)
**Estado:** ✅ Activo en Producción

Clasifica productos por valor económico:
- **Clase A:** ~20% productos = ~80% del valor (alta prioridad)
- **Clase B:** ~30% productos = ~15% del valor (prioridad media)
- **Clase C:** ~50% productos = ~5% del valor (baja prioridad)

**Archivos clave:**
- `backend/routers/abc_v2_router.py`
- `database/schema_abc_v2.sql`
- `frontend/src/components/productos/ABCXYZAnalysis.tsx`

### 2.2 Clasificación XYZ (Variabilidad de Demanda)
**Estado:** ⏸️ Implementado pero OCULTO (Feature Flag)

Clasifica productos por estabilidad de demanda usando Coeficiente de Variación (CV):
- **Clase X:** CV < 0.5 (demanda estable, predecible)
- **Clase Y:** 0.5 ≤ CV < 1.0 (demanda variable)
- **Clase Z:** CV ≥ 1.0 (demanda errática, impredecible)

**Control:**
```typescript
// frontend/src/config/featureFlags.ts
ENABLE_XYZ_ANALYSIS: false  // Cambiar a true para activar
```

**Archivos clave:**
- `backend/analisis_xyz.py`
- `backend/routers/analisis_xyz_router.py`
- `database/schema_abc_xyz.sql`

### 2.3 Sistema de Nivel Objetivo v2.0
**Estado:** ✅ Fase 1 Completada

Calcula niveles óptimos de inventario por producto/tienda:
- Stock de seguridad basado en variabilidad
- Punto de reorden
- Nivel objetivo (stock máximo)
- Cantidad sugerida a pedir

**Fórmulas implementadas:**
```
Stock Seguridad = Z × σ × √(Lead Time)
Punto Reorden = Demanda Diaria × Lead Time + Stock Seguridad
Nivel Objetivo = Demanda Ciclo + Stock Seguridad
Cantidad Sugerida = max(0, Nivel Objetivo - Stock Actual - En Tránsito)
```

**Archivos clave:**
- `backend/routers/nivel_objetivo_router.py`
- `database/schema_nivel_objetivo.sql`
- `frontend/src/services/nivelObjetivoService.ts`

### 2.4 Wizard de Pedidos Sugeridos v2
**Estado:** ✅ Activo en Producción

Flujo de 3 pasos para crear pedidos:
1. **Paso 1:** Selección de origen (CEDI) y destino (Tienda)
2. **Paso 2:** Selección de productos con déficit (tabla extendida)
3. **Paso 3:** Confirmación y creación del pedido

**Features del Paso 2:**
- Filtros por ABC (A/B/C)
- Filtros por Cuadrante (I-XII)
- Búsqueda por código/nombre
- Toggle "Solo con Déficit"
- Edición de cantidades a pedir
- Notas por producto
- Resumen flotante (productos, unidades, peso)

**Archivos clave:**
- `frontend/src/components/orders/PedidoSugeridoV2Wizard.tsx`
- `frontend/src/components/orders/wizard-v2/PasoSeleccionProductosV2Extended.tsx`
- `backend/routers/pedidos_sugeridos.py`

### 2.5 ETL de Datos
**Estado:** ✅ Activo

Extracción de datos desde sistemas POS:
- **Stellar:** 14 tiendas (sistema legacy)
- **KLK:** 4 tiendas migradas (Periférico, Bosque, Artigas, Paraíso)

**Datos procesados:**
- 81.8M+ registros de ventas
- 13 meses de historia (Sep 2024 - Nov 2025)
- 16 tiendas activas

**Archivos clave:**
- `etl/core/etl_ventas_historico.py`
- `etl/core/etl_inventario_klk.py`
- `etl/core/tiendas_config.py`

### 2.6 Dashboard de Productos
**Estado:** ✅ Activo

Vista de análisis de productos:
- Resumen ABC (tabla Pareto)
- Gráfico de distribución ABC
- Lista de productos con filtros
- Modal de detalle por producto

### 2.7 Autenticación y Usuarios
**Estado:** ✅ Activo

- JWT + bcrypt
- Roles de usuario
- Contexto de autenticación en frontend

---

## 3. Features NO Implementados / Ocultos (QUÉ NO HACEMOS)

### 3.1 Matriz ABC-XYZ Completa (9 Cuadrantes)
**Estado:** ⏸️ Código existe, UI oculta

La matriz 3x3 que combina ABC con XYZ está implementada pero oculta:
```
     X (Estable)  Y (Variable)  Z (Errático)
A    AX           AY            AZ
B    BX           BY            BZ
C    CX           CY            CZ
```

**Para activar:** Cambiar `ENABLE_XYZ_ANALYSIS: true` en featureFlags.ts

### 3.2 Conjuntos Sustituibles
**Estado:** ⏸️ Backend listo, Router deshabilitado

Sistema para agrupar productos intercambiables y hacer pronóstico jerárquico.

**Archivos:**
- `backend/routers/conjuntos_router.py` (comentado en main.py)
- `database/schema_conjuntos_sustituibles.sql`

### 3.3 Sistema de Alertas de Reclasificación
**Estado:** 🟡 Parcialmente implementado

Alertas cuando un producto cambia de clasificación ABC.

**Archivos:**
- `frontend/src/components/admin/AlertasReclasificacion.tsx`
- `database/schema_alertas_clasificacion.sql`

### 3.4 Forecast/Pronóstico de Demanda
**Estado:** 🟡 Parcialmente implementado

Pronóstico usando Promedio Móvil Ponderado (PMP).

**Archivos:**
- `backend/forecast_pmp.py`
- `database/schema_forecast.sql`

### 3.5 CEDI Caracas
**Estado:** ❌ No configurado

El CEDI de Caracas no existe en la configuración actual. Solo hay tiendas.

### 3.6 Notificaciones por Email
**Estado:** ✅ Código listo, no activo en producción

Sistema de notificaciones con SendGrid.

**Archivos:**
- `backend/email_notifier.py`

### 3.7 Modo Mantenimiento
**Estado:** ⏸️ Deshabilitado temporalmente

```typescript
// App.tsx - comentado
// import MaintenancePage from './components/MaintenancePage';
```

---

## 4. Configuración de Tiendas

### 4.1 Tiendas Activas (16)

| ID | Nombre | Sistema POS | Estado ETL |
|----|--------|-------------|------------|
| tienda_01 | PERIFERICO | KLK | ✅ Activo |
| tienda_02 | PREBO | Stellar | ✅ Activo |
| tienda_03 | GUAPARO | Stellar | ✅ Activo |
| tienda_04 | SAN DIEGO | Stellar | ✅ Activo |
| tienda_05 | TRIGAL | Stellar | ✅ Activo |
| tienda_06 | LOS GUAYOS | Stellar | ✅ Activo |
| tienda_07 | MIGUEL PEÑA | Stellar | ✅ Activo |
| tienda_08 | BOSQUE | KLK | ✅ Activo |
| tienda_09 | GUACARA | Stellar | ✅ Activo |
| tienda_10 | FERIAS | Stellar | ❌ Sin conectividad |
| tienda_11 | FLOR AMARILLO | Stellar | ✅ Activo |
| tienda_12 | PARAPARAL | Stellar | ✅ Activo |
| tienda_13 | SAN BLAS | Stellar | ✅ Activo |
| tienda_14 | MONTALBAN | Stellar | ✅ Activo |
| tienda_15 | LA ISABELICA | Stellar | ✅ Activo |
| tienda_16 | LA ENTRADA | Stellar | ✅ Activo |

### 4.2 Tiendas Nuevas (Pendientes IP)

| ID | Nombre | Código KLK | IP | Estado |
|----|--------|------------|-----|--------|
| tienda_17 | ARTIGAS | TANT | ⚠️ 192.168.0.0 | Pendiente IP real |
| tienda_18 | PARAISO | PALT | ⚠️ 192.168.0.0 | Pendiente IP real |
| tienda_20 | TAZAJAL | TTZ | 192.168.220.10 | No migrado a KLK |

### 4.3 CEDIs Configurados

| ID | Nombre | Estado |
|----|--------|--------|
| cedi_seco | CEDI Seco | ✅ Activo |
| cedi_frio | CEDI Frio | ✅ Activo |
| cedi_verde | CEDI Verde | ✅ Activo |
| cedi_frutas | CEDI Frutas | ⏸️ Inactivo |
| **cedi_caracas** | CEDI Caracas | ❌ **NO EXISTE** |

---

## 5. Endpoints API Principales

### Backend (Puerto 8001)

```
# Análisis ABC
GET  /api/abc-v2/resumen/{ubicacion_id}
GET  /api/abc-v2/clasificacion/{producto_id}
GET  /api/abc-v2/top-productos/{ubicacion_id}

# Análisis XYZ (si está habilitado)
GET  /api/analisis-xyz/producto/{producto_id}
GET  /api/analisis-xyz/comparar

# Niveles de Inventario
GET  /api/niveles-inventario/tienda/{tienda_id}
POST /api/niveles-inventario/calcular
POST /api/niveles-inventario/cantidad-sugerida
GET  /api/niveles-inventario/clasificacion/{tienda_id}/{producto_id}

# Pedidos Sugeridos
GET  /api/pedidos-sugeridos
POST /api/pedidos-sugeridos
GET  /api/pedidos-sugeridos/{id}
PUT  /api/pedidos-sugeridos/{id}/aprobar
PUT  /api/pedidos-sugeridos/{id}/rechazar

# Matrices ABC-XYZ
GET  /api/matrices-abc-xyz
GET  /api/cuadrante-matriz-abc-xyz
GET  /api/clasificacion-abc-xyz-producto

# Configuración
GET  /api/config-inventario/parametros/{ubicacion_id}
PUT  /api/config-inventario/parametros/{ubicacion_id}

# Ubicaciones
GET  /api/ubicaciones
GET  /api/ubicaciones/tiendas
GET  /api/ubicaciones/cedis
```

---

## 6. Feature Flags

```typescript
// frontend/src/config/featureFlags.ts

export const FEATURE_FLAGS = {
  // Análisis XYZ (variabilidad de demanda)
  // false = Solo mostrar ABC, ocultar XYZ
  ENABLE_XYZ_ANALYSIS: false,

  // Matriz completa 3x3
  // Solo tiene efecto si XYZ está habilitado
  SHOW_FULL_MATRIX: false,
};
```

### Efecto de `ENABLE_XYZ_ANALYSIS: false`:
- ❌ Oculta resumen XYZ en página de productos
- ❌ Oculta matriz 3x3 ABC-XYZ
- ❌ Oculta columna XYZ en tabla de productos
- ❌ Oculta filtro XYZ en wizard de pedidos
- ✅ Badges muestran solo "A", "B", "C" (sin X/Y/Z)
- ✅ Tooltips muestran solo información ABC

---

## 7. Estructura de Directorios

```
fluxion-workspace/
├── backend/                 # API FastAPI
│   ├── main.py             # Servidor principal
│   ├── routers/            # Endpoints por dominio
│   ├── auth.py             # Autenticación JWT
│   └── tiendas_config.py   # Configuración de tiendas
│
├── frontend/                # React + Vite
│   ├── src/
│   │   ├── components/     # Componentes React
│   │   │   ├── productos/  # Análisis ABC/XYZ
│   │   │   ├── orders/     # Pedidos sugeridos
│   │   │   └── admin/      # Configuración
│   │   ├── services/       # Llamadas API
│   │   └── config/         # Feature flags
│   └── package.json
│
├── database/                # Esquemas DuckDB
│   ├── schema_abc_v2.sql
│   ├── schema_abc_xyz.sql
│   └── schema_nivel_objetivo.sql
│
├── etl/                     # Extracción de datos
│   ├── core/               # Scripts principales
│   └── logs/               # Logs de ejecución
│
├── data/                    # Bases de datos (gitignored)
│   └── fluxion_production.db
│
└── docs/                    # Documentación
```

---

## 8. Próximos Pasos (Roadmap)

### Inmediato (Para Producción)
1. ✅ Simplificar UI a solo ABC (XYZ oculto)
2. ⏳ Configurar tiendas Caracas (Artigas + CEDI)
3. ⏳ Verificar conectividad cuando KLK esté disponible

### Corto Plazo
1. Completar Fase 2 de Nivel Objetivo (lógica de cálculo refinada)
2. Activar sistema de alertas de reclasificación
3. Implementar notificaciones por email

### Mediano Plazo
1. Reactivar análisis XYZ cuando el cliente lo solicite
2. Habilitar conjuntos sustituibles
3. Mejorar pronóstico de demanda

---

## 9. Comandos Útiles

```bash
# Desarrollo
./start_dev.sh              # Inicia backend + frontend
./stop_dev.sh               # Detiene servicios

# Backend
cd backend && python3 start.py

# Frontend
cd frontend && npm run dev

# Verificar tipos
cd frontend && npm run type-check

# ETL
cd etl && python3 core/etl_inventario_klk.py

# Base de datos
duckdb data/fluxion_production.db
```

---

## 10. Contacto y Soporte

- **Repositorio:** /Users/jose/Developer/fluxion-workspace
- **Backend API Docs:** http://localhost:8001/docs
- **Frontend Dev:** http://localhost:3001
