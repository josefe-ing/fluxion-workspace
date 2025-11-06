# Propuesta: Sistema de Configuración de Parámetros de Inventario

## 📊 Contexto

Actualmente Fluxion tiene parámetros de inventario **hardcodeados** en 3 lugares:

1. **`tiendas_config.py`**: Multiplicadores de stock por tienda/ABC
2. **`analisis_xyz.py`**: Parámetros globales de análisis XYZ
3. **`analisis_xyz_router.py`**: Umbrales de clasificación ABC

Esta propuesta unifica todo en un **sistema configurable desde la UI**.

---

## 🎯 Estructura de Configuración

### 1️⃣ **Configuración Global**

Parámetros que aplican a todas las tiendas (a menos que la tienda tenga override):

```sql
CREATE TABLE config_inventario_global (
    id VARCHAR PRIMARY KEY,
    categoria VARCHAR NOT NULL,
    parametro VARCHAR NOT NULL,
    valor_numerico DECIMAL(10,4),
    valor_texto VARCHAR,
    descripcion VARCHAR,
    unidad VARCHAR,
    activo BOOLEAN DEFAULT true,
    fecha_modificacion TIMESTAMP,
    modificado_por VARCHAR,
    UNIQUE(categoria, parametro)
);
```

**Categorías**:
- `abc_umbrales`: Umbrales de clasificación ABC
- `xyz_umbrales`: Umbrales de clasificación XYZ
- `niveles_servicio`: Z-scores por clasificación
- `ajustes_xyz`: Ajustes de stock por variabilidad
- `tendencias`: Parámetros de detección de tendencias
- `estacionalidad`: Factores estacionales
- `stock_defaults`: Multiplicadores por defecto

### 2️⃣ **Configuración por Tienda**

Override de multiplicadores de stock para tiendas específicas:

```sql
CREATE TABLE config_inventario_tienda (
    id VARCHAR PRIMARY KEY,
    tienda_id VARCHAR NOT NULL,
    clasificacion_abc VARCHAR NOT NULL,
    stock_min_multiplicador DECIMAL(6,2),
    stock_seg_multiplicador DECIMAL(6,2),
    stock_max_multiplicador DECIMAL(6,2),
    lead_time_dias INTEGER DEFAULT 3,
    activo BOOLEAN DEFAULT true,
    fecha_modificacion TIMESTAMP,
    modificado_por VARCHAR,
    UNIQUE(tienda_id, clasificacion_abc)
);
```

---

## 📋 Parámetros Configurables

### **A. Umbrales de Clasificación ABC** (por venta diaria en bultos)

| Parámetro | Valor Actual | Descripción |
|-----------|--------------|-------------|
| `abc_umbral_a` | 20.0 | A: ≥ 20 bultos/día |
| `abc_umbral_ab` | 5.0 | AB: ≥ 5 bultos/día |
| `abc_umbral_b` | 0.45 | B: ≥ 0.45 bultos/día |
| `abc_umbral_bc` | 0.2 | BC: ≥ 0.2 bultos/día |
| `abc_umbral_c` | 0.001 | C: ≥ 0.001 bultos/día |

### **B. Multiplicadores de Stock por ABC** (valores por defecto)

| ABC | Stock Mínimo | Stock Seguridad | Stock Máximo |
|-----|--------------|-----------------|--------------|
| A   | 2.0x         | 1.0x            | 5.0x         |
| AB  | 2.0x         | 2.5x            | 7.0x         |
| B   | 3.0x         | 2.0x            | 12.0x        |
| BC  | 9.0x         | 3.0x            | 17.0x        |
| C   | 15.0x        | 7.0x            | 26.0x        |

### **C. Umbrales de Clasificación XYZ** (por coeficiente de variación)

| Parámetro | Valor Actual | Descripción |
|-----------|--------------|-------------|
| `xyz_umbral_x` | 0.5 | X (Predecible): CV < 0.5 |
| `xyz_umbral_y` | 1.0 | Y (Variable): 0.5 ≤ CV ≤ 1.0 |
| `xyz_umbral_z` | 1.0 | Z (Errático): CV > 1.0 |

### **D. Niveles de Servicio por ABC** (Z-scores)

| ABC | Z-score | Nivel Servicio |
|-----|---------|----------------|
| A   | 2.33    | 99%            |
| AB  | 2.05    | 98%            |
| B   | 1.65    | 95%            |
| BC  | 1.28    | 90%            |
| C   | 0.84    | 80%            |

### **E. Ajustes por Variabilidad XYZ** (sobre stock de seguridad)

| XYZ | Ajuste | Descripción |
|-----|--------|-------------|
| X   | -20%   | Reducir stock seguridad (predecible) |
| Y   | 0%     | Mantener normal (variable) |
| Z   | +30%   | Aumentar stock seguridad (errático) |

### **F. Parámetros de Stock General**

| Parámetro | Valor Actual | Descripción |
|-----------|--------------|-------------|
| `lead_time_dias` | 3 | Días de reposición desde CEDI |
| `stock_min_dias` | 3 | Días de cobertura para stock mínimo |
| `stock_max_dias` | 6 | Días de cobertura para stock máximo |

### **G. Detección de Tendencias**

| Parámetro | Valor Actual | Descripción |
|-----------|--------------|-------------|
| `tendencia_periodo_corto` | 5 | Días para calcular venta reciente |
| `tendencia_periodo_largo` | 20 | Días para calcular venta histórica |
| `tendencia_umbral_significancia` | 0.20 | 20% de cambio para considerar tendencia |

### **H. Factores Estacionales**

| Parámetro | Valor Actual | Descripción |
|-----------|--------------|-------------|
| `estacional_fin_semana_factor` | 1.4 | +40% en fin de semana |
| `estacional_quincena_factor` | 1.2 | +20% en quincena |
| `estacional_quincena_dias_1` | "1-7" | Primera quincena |
| `estacional_quincena_dias_2` | "15-22" | Segunda quincena |

---

## 🎨 Interfaz de Usuario

### **Panel: Administrador > Configuración de Inventario**

#### **Pestaña 1: Clasificación ABC**
```
┌─────────────────────────────────────────────────────────────────┐
│  📊 UMBRALES DE CLASIFICACIÓN ABC                               │
│                                                                  │
│  Basado en venta diaria promedio (bultos/día)                   │
│                                                                  │
│  ┌────────────────────────────────────────────────┐            │
│  │ Clase │ Umbral (bultos/día) │ [Editar]         │            │
│  ├────────────────────────────────────────────────┤            │
│  │   A   │  ≥ [20.00]          │  ✏️               │            │
│  │  AB   │  ≥ [5.00]           │  ✏️               │            │
│  │   B   │  ≥ [0.45]           │  ✏️               │            │
│  │  BC   │  ≥ [0.20]           │  ✏️               │            │
│  │   C   │  ≥ [0.001]          │  ✏️               │            │
│  └────────────────────────────────────────────────┘            │
│                                                                  │
│  💡 Productos se clasifican según su rotación diaria            │
│                                                                  │
│  [Restaurar Valores] [Guardar Cambios]                         │
└─────────────────────────────────────────────────────────────────┘
```

#### **Pestaña 2: Multiplicadores de Stock**
```
┌─────────────────────────────────────────────────────────────────┐
│  🎯 MULTIPLICADORES DE STOCK POR DEFECTO                        │
│                                                                  │
│  Aplica a todas las tiendas (salvo override por tienda)         │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ ABC │ Stock Mínimo │ Stock Seguridad │ Stock Máximo     │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │  A  │  [2.0] x     │  [1.0] x        │  [5.0] x         │  │
│  │ AB  │  [2.0] x     │  [2.5] x        │  [7.0] x         │  │
│  │  B  │  [3.0] x     │  [2.0] x        │  [12.0] x        │  │
│  │ BC  │  [9.0] x     │  [3.0] x        │  [17.0] x        │  │
│  │  C  │  [15.0] x    │  [7.0] x        │  [26.0] x        │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ⚙️  Parámetros Generales                                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Lead Time:        [3] días                                │  │
│  │ Stock Mín (días): [3] días                                │  │
│  │ Stock Máx (días): [6] días                                │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  [Ver Config. por Tienda] [Guardar]                            │
└─────────────────────────────────────────────────────────────────┘
```

#### **Pestaña 3: Análisis XYZ**
```
┌─────────────────────────────────────────────────────────────────┐
│  🌀 ANÁLISIS XYZ (VARIABILIDAD)                                 │
│                                                                  │
│  Umbrales de Clasificación                                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ X (Predecible):   CV < [0.5]                             │  │
│  │ Y (Variable):     [0.5] ≤ CV ≤ [1.0]                     │  │
│  │ Z (Errático):     CV > [1.0]                             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Niveles de Servicio (Z-scores)                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ ABC │ Z-score │ Nivel Servicio │ Ajuste XYZ             │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │  A  │ [2.33]  │  99%           │ X:-20% Y:0% Z:+30%     │  │
│  │ AB  │ [2.05]  │  98%           │ X:-20% Y:0% Z:+30%     │  │
│  │  B  │ [1.65]  │  95%           │ X:-20% Y:0% Z:+30%     │  │
│  │ BC  │ [1.28]  │  90%           │ X:-20% Y:0% Z:+30%     │  │
│  │  C  │ [0.84]  │  80%           │ X:-20% Y:0% Z:+30%     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  [Guardar Cambios]                                              │
└─────────────────────────────────────────────────────────────────┘
```

#### **Pestaña 4: Tendencias y Estacionalidad**
```
┌─────────────────────────────────────────────────────────────────┐
│  📈 DETECCIÓN DE TENDENCIAS                                     │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Periodo Corto:   [5] días                                │  │
│  │ Periodo Largo:   [20] días                               │  │
│  │ Umbral Cambio:   [20]%                                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  📅 FACTORES ESTACIONALES                                       │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ ☑️ Fin de Semana:  +[40]%                                 │  │
│  │    Aplica: Sábado y Domingo                              │  │
│  │                                                            │  │
│  │ ☑️ Quincena:       +[20]%                                 │  │
│  │    Días: [1-7] y [15-22] del mes                         │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  [Guardar Cambios]                                              │
└─────────────────────────────────────────────────────────────────┘
```

#### **Pestaña 5: Configuración por Tienda** (Modal)
```
┌─────────────────────────────────────────────────────────────────┐
│  🏪 OVERRIDE POR TIENDA: Av. Bolívar                            │
│                                                                  │
│  ☑️ Usar configuración personalizada                            │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ ABC │ Mínimo │ Seguridad │ Máximo │ Lead Time            │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │  A  │ [2.0]  │ [1.0]     │ [5.0]  │  [3] días   [reset] │  │
│  │ AB  │ [2.0]  │ [2.5]     │ [7.0]  │  [3] días   [reset] │  │
│  │  B  │ [3.0]  │ [2.0]     │ [9.0]  │  [3] días   [reset] │  │
│  │ BC  │ [9.0]  │ [3.0]     │ [15.0] │  [3] días   [reset] │  │
│  │  C  │ [15.0] │ [7.0]     │ [26.0] │  [3] días   [reset] │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  💡 Valores diferentes a los globales se muestran en negrita    │
│                                                                  │
│  [Restaurar Globales] [Guardar]                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔧 Implementación Backend

### **1. Servicio de Configuración**

```python
# backend/services/config_inventario.py

class ConfigInventarioService:
    """Servicio para gestionar configuración de inventario"""

    @staticmethod
    def obtener_umbrales_abc(conn) -> Dict[str, float]:
        """Retorna umbrales de clasificación ABC"""

    @staticmethod
    def obtener_multiplicadores_tienda(conn, tienda_id: str, clasificacion_abc: str) -> Dict:
        """Retorna multiplicadores de stock para tienda+ABC
        Usa override si existe, sino retorna valores globales"""

    @staticmethod
    def obtener_parametros_xyz(conn) -> Dict:
        """Retorna parámetros de análisis XYZ"""

    @staticmethod
    def actualizar_configuracion_global(conn, categoria: str, parametros: Dict):
        """Actualiza parámetros globales"""

    @staticmethod
    def actualizar_configuracion_tienda(conn, tienda_id: str, config: Dict):
        """Actualiza configuración específica de tienda"""
```

### **2. Migración de Parámetros Actuales**

Script para migrar desde `tiendas_config.py` a BD:

```python
# backend/migrations/migrate_config_inventario.py

def migrar_parametros_tiendas():
    """Migra multiplicadores de tiendas_config.py a BD"""

def migrar_parametros_xyz():
    """Migra parámetros de analisis_xyz.py a BD"""

def migrar_umbrales_abc():
    """Migra umbrales de analisis_xyz_router.py a BD"""
```

### **3. Refactorización de Código Existente**

- `analisis_xyz.py`: Leer parámetros de BD en lugar de constantes
- `analisis_xyz_router.py`: Usar servicio de configuración
- `tiendas_config.py`: Mantener solo conectividad, remover multiplicadores

---

## ✅ Ventajas

1. **Flexibilidad Total**: Ajustar sin desplegar código
2. **Por Tienda**: Cada tienda puede tener parámetros únicos
3. **Auditoría**: Rastrear cambios (quién, cuándo, qué)
4. **A/B Testing**: Probar configuraciones fácilmente
5. **UX Mejorada**: Gerentes ajustan sin programador
6. **Historial**: Ver evolución de parámetros
7. **Validaciones**: Asegurar coherencia de datos

---

## 📝 Plan de Implementación

### **Fase 1: Backend** (2-3 días)
- [ ] Crear tablas en DuckDB
- [ ] Script de migración de datos actuales
- [ ] Servicio `ConfigInventarioService`
- [ ] Endpoints API REST para CRUD
- [ ] Refactorizar `analisis_xyz.py` y `analisis_xyz_router.py`

### **Fase 2: Frontend** (2-3 días)
- [ ] Panel de administración con 5 pestañas
- [ ] Formularios de edición con validaciones
- [ ] Vista de configuración por tienda
- [ ] Comparación global vs. override
- [ ] Botón "Restaurar valores"

### **Fase 3: Testing** (1 día)
- [ ] Tests unitarios de servicio
- [ ] Tests de endpoints
- [ ] Tests de integración frontend-backend
- [ ] Validación con datos reales

### **Fase 4: Documentación** (0.5 días)
- [ ] Manual de uso para gerentes
- [ ] Documentación técnica
- [ ] Guía de mejores prácticas

---

## 🚀 Próximos Pasos

¿Te gustaría que empiece con la implementación?

**Opciones**:
1. **Empezar con Fase 1**: Crear backend completo
2. **Empezar con subset**: Solo umbrales ABC primero
3. **Prototipo UI**: Crear interfaz primero para validar diseño
4. **Otro enfoque**: Sugerencias de tu parte

¿Qué prefieres?
