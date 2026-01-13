# Plan de Refactoring - Fluxion AI

## Resumen Ejecutivo

Este plan identifica las áreas de mejora en el proyecto Fluxion AI y propone acciones concretas para limpiar el código, eliminar archivos obsoletos, y mejorar la cobertura de pruebas unitarias.

---

## 1. Archivos y Directorios Obsoletos a Eliminar

### 1.1 Frontend - Componentes de Backup (ALTA PRIORIDAD)

**Directorio:** `frontend/OLD_COMPONENTS_BACKUP/`

18 archivos de componentes obsoletos (~230KB total):
- `AIAgentPanel.tsx`
- `ClientIntelligence.tsx`
- `DailyActionCenter.tsx`
- `DataSynchronization.tsx`
- `EnhancedAIAgentPanel.tsx`
- `EnhancedKPICards.tsx`
- `Header.tsx`
- `InventoryStatusBreakdown.tsx`
- `KPICards.tsx`
- `MainDashboard.tsx`
- `OptimizationReports.tsx`
- `ProactiveInsightsPanel.tsx`
- `PurchaseIntelligence.tsx`
- `ROITracker.tsx`
- `Settings.tsx`
- `SmartNotifications.tsx`
- `SupplierConfiguration.tsx`
- `SyncHistory.tsx`

**Acción:** Eliminar todo el directorio `OLD_COMPONENTS_BACKUP/`

### 1.2 ETL - Archivos Archivados (ALTA PRIORIDAD)

**Directorio:** `etl/archive/`

12 archivos de scripts ETL obsoletos (~175KB total):
- `crear_datos_prueba.py`
- `ejecutar_etl_completo.py`
- `etl_multi_tienda.py`
- `etl_ventas.py`
- `etl_ventas_multi_tienda.py`
- `extractor.py`
- `extractor_ventas.py`
- `extraer_historico_mensual.py`
- `loader.py`
- `loader_ventas.py`
- `transformer.py`
- `transformer_ventas.py`

**Acción:** Eliminar todo el directorio `etl/archive/`

### 1.3 Frontend - Mock Data No Utilizado

**Archivo:** `frontend/src/data/mockData.ts`

- ~1,000 líneas de datos mock que no se importan en ningún componente activo
- Contiene datos de demostración antiguos (clients, alerts, suppliers, etc.)

**Acción:** Eliminar `frontend/src/data/mockData.ts`

### 1.4 Scripts de Debugging en Raíz del Proyecto

**Archivos en la raíz:**
- `check_duplicates.py` - Script de debugging temporal
- `check_schema.py` - Script de debugging temporal
- `check_stock.py` - Script de debugging temporal
- `check_stock_ventas.py` - Script de debugging temporal

**Acción:** Eliminar estos 4 archivos de la raíz del proyecto

### 1.5 Backend - Archivos Obsoletos y Temporales

**Archivos a revisar/eliminar:**
- `backend/reporte_ventas_tienda_*.txt` (7 archivos) - Reportes temporales
- `backend/uvicorn.log` (~482KB) - Log que no debería estar en el repo
- `backend/coverage.json` (~84KB) - Artefacto de tests
- `backend/htmlcov/` - Directorio de coverage HTML
- `backend/.coverage` - Archivo de coverage
- `backend/create_user_jfernandez.py` - Script one-time para crear usuario específico

### 1.6 ETL Core - Archivos Redundantes

**Archivos a revisar:**
- `etl/core/etl_ventas.py.backup` - Backup de archivo
- `etl/core/reporte_ventas_tienda_01_*.txt` - Reporte temporal
- `etl/core/transformer.py` y `etl/core/transformer_ventas.py` - Verificar si se usan

---

## 2. Refactoring de Código (CRÍTICO)

### 2.1 Backend - main.py es Demasiado Grande

**Problema:** `backend/main.py` tiene **9,822 líneas** - esto es un code smell severo.

**Propuesta de refactoring:**

```
backend/
├── main.py                    # Solo startup, middleware, router registration (~200 líneas)
├── routers/
│   ├── auth.py               # Endpoints de autenticación (mover desde main.py)
│   ├── ventas.py             # Endpoints de ventas (mover desde main.py)
│   ├── inventario.py         # Endpoints de inventario (mover desde main.py)
│   ├── productos.py          # Endpoints de productos (mover desde main.py)
│   ├── estadisticas.py       # Endpoints de estadísticas (mover desde main.py)
│   ├── sync.py               # Endpoints de sincronización ETL (mover desde main.py)
│   ├── ubicaciones.py        # Endpoints de ubicaciones (mover desde main.py)
│   └── [routers existentes]
├── services/
│   ├── ventas_service.py     # Lógica de negocio de ventas
│   ├── inventario_service.py # Lógica de negocio de inventario
│   └── [services existentes]
└── schemas/
    ├── ventas.py             # Pydantic models para ventas
    ├── inventario.py         # Pydantic models para inventario
    └── [otros schemas]
```

**Beneficios:**
- Mejor mantenibilidad
- Facilita testing unitario
- Separación de responsabilidades
- Permite trabajo paralelo en diferentes módulos

### 2.2 Frontend - Componentes Muy Grandes

**Componentes que necesitan refactoring (>1,000 líneas):**

| Componente | Líneas | Acción Sugerida |
|------------|--------|-----------------|
| `ConfiguracionABC.tsx` | 2,019 | Dividir en sub-componentes |
| `OrderStepTwo.tsx` | 1,954 | Extraer lógica a hooks, dividir UI |
| `ProductSalesModal.tsx` | 1,871 | Dividir en componentes más pequeños |
| `EmergenciasDashboard.tsx` | 1,178 | Extraer componentes de tabla/gráficos |
| `OrderStepThree.tsx` | 1,032 | Dividir en sub-componentes |

**Patrón recomendado:**
```
components/
├── orders/
│   ├── OrderStepTwo/
│   │   ├── index.tsx           # Componente principal
│   │   ├── ProductTable.tsx    # Sub-componente tabla
│   │   ├── FilterPanel.tsx     # Sub-componente filtros
│   │   ├── useOrderStepTwo.ts  # Custom hook con lógica
│   │   └── types.ts            # Tipos locales
```

---

## 3. Pruebas Unitarias

### 3.1 Estado Actual de Tests

**Backend (Python):**
- `backend/tests/test_pedidos_sugeridos.py` - 1 archivo de tests existente
- `backend/test_multi_tienda_email.py` - Test de email (mover a tests/)
- Coverage existente: `.coverage`, `coverage.json`, `htmlcov/`

**Frontend (TypeScript):**
- **NO hay tests** - No existen archivos `.test.ts` o `.test.tsx`
- No hay configuración de Jest/Vitest

**ETL:**
- `etl/test_etl_simple.py`
- `etl/test_etl_prod.py`
- `etl/test_copy_optimization.py`
- `etl/test_vpn_connectivity.py`
- `etl/core/test_conectividad_simple.py`

### 3.2 Plan de Mejora de Tests - Backend

**Prioridad 1: Tests de Routers (Crítico)**

```python
# backend/tests/test_ventas.py
# backend/tests/test_inventario.py
# backend/tests/test_productos.py
# backend/tests/test_auth.py
# backend/tests/test_estadisticas.py
```

**Prioridad 2: Tests de Services**

```python
# backend/tests/services/test_bi_calculations.py
# backend/tests/services/test_detector_emergencias.py
# backend/tests/services/test_calculo_inventario_abc.py
```

**Prioridad 3: Tests de Models**

```python
# backend/tests/models/test_pedidos_sugeridos.py
# backend/tests/models/test_conjuntos.py
# backend/tests/models/test_emergencias.py
```

### 3.3 Plan de Mejora de Tests - Frontend

**Setup necesario:**
1. Agregar Vitest a `package.json`
2. Configurar `vitest.config.ts`
3. Agregar scripts de test

**Prioridad 1: Tests de Services**

```typescript
// frontend/src/services/__tests__/api.test.ts
// frontend/src/services/__tests__/pedidosService.test.ts
// frontend/src/services/__tests__/productosService.test.ts
```

**Prioridad 2: Tests de Hooks**

```typescript
// frontend/src/hooks/__tests__/useAIEngine.test.ts
```

**Prioridad 3: Tests de Componentes Críticos**

```typescript
// frontend/src/components/orders/__tests__/OrderWizard.test.tsx
// frontend/src/components/dashboard/__tests__/InventoryDashboard.test.tsx
```

---

## 4. Configuración y Dependencias

### 4.1 Archivos .gitignore Necesarios

Agregar a `.gitignore`:
```
# Coverage
.coverage
coverage.json
htmlcov/

# Logs
*.log
uvicorn.log

# Reportes temporales
reporte_*.txt

# Backups
*.backup
```

### 4.2 Archivos Duplicados de Configuración

**Backend tiene múltiples archivos .env:**
- `.env`
- `.env.development`
- `.env.example`
- `.env.local`
- `.env.production`

**Acción:** Consolidar y documentar el uso de cada archivo

---

## 5. Orden de Ejecución Recomendado

### Fase 1: Limpieza Inmediata (1-2 días)
1. [ ] Eliminar `frontend/OLD_COMPONENTS_BACKUP/`
2. [ ] Eliminar `etl/archive/`
3. [ ] Eliminar scripts de debugging en raíz
4. [ ] Eliminar archivos temporales del backend
5. [ ] Actualizar `.gitignore`

### Fase 2: Refactoring Backend (1-2 semanas)
1. [ ] Extraer endpoints de ventas de `main.py` a `routers/ventas.py`
2. [ ] Extraer endpoints de inventario a `routers/inventario.py`
3. [ ] Extraer endpoints de productos a `routers/productos.py`
4. [ ] Crear schemas en `backend/schemas/`
5. [ ] Mover lógica de negocio a services

### Fase 3: Tests Backend (1-2 semanas)
1. [ ] Configurar pytest con fixtures reutilizables
2. [ ] Escribir tests para routers críticos
3. [ ] Escribir tests para services
4. [ ] Alcanzar cobertura >70%

### Fase 4: Refactoring Frontend (1-2 semanas)
1. [ ] Eliminar `mockData.ts`
2. [ ] Refactorizar `ConfiguracionABC.tsx`
3. [ ] Refactorizar `OrderStepTwo.tsx`
4. [ ] Refactorizar `ProductSalesModal.tsx`

### Fase 5: Tests Frontend (1-2 semanas)
1. [ ] Configurar Vitest
2. [ ] Escribir tests para services
3. [ ] Escribir tests para hooks
4. [ ] Escribir tests para componentes críticos

---

## 6. Métricas de Éxito

| Métrica | Actual | Objetivo |
|---------|--------|----------|
| Líneas en main.py | 9,822 | < 300 |
| Archivos obsoletos | ~40+ | 0 |
| Coverage Backend | ? | > 70% |
| Coverage Frontend | 0% | > 50% |
| Componentes >1000 líneas | 5 | 0 |

---

## 7. Riesgos y Mitigación

1. **Riesgo:** Romper funcionalidad al mover código
   - **Mitigación:** Escribir tests antes de refactorizar

2. **Riesgo:** Eliminar código que aún se usa
   - **Mitigación:** Verificar imports antes de eliminar

3. **Riesgo:** Tiempo de desarrollo
   - **Mitigación:** Priorizar y hacer incrementalmente

---

*Plan creado: 2026-01-13*
*Próxima revisión: Después de Fase 1*
