# Estrategia de Testing - Fluxion AI Backend

## Análisis del Backend

### Archivos Principales Analizados

1. **main.py** (1610 líneas) - API principal FastAPI
2. **forecast_pmp.py** (484 líneas) - Modelo de forecast Promedio Móvil Ponderado
3. **simple_api.py** (382 líneas) - API simplificada para ubicaciones/inventario
4. **start.py** (81 líneas) - Script de inicio

---

## Priorización de Testing por Lógica de Negocio

### 🔴 **CRÍTICAS** (Alta Prioridad - Afectan directamente decisiones de negocio)

#### 1. **Cálculo de Pedidos Sugeridos** (`main.py:1090-1360`)
**Lógica crítica:** Calcula automáticamente qué productos pedir y en qué cantidad.

**Funciones a testear:**
- `calcular_pedido_sugerido()` - Línea 1091
- Lógica de decisión de pedido (líneas 1286-1298):
  ```python
  if stock_total < punto_reorden:
      cantidad_sugerida = (stock_maximo - stock_total) + pronostico_unid
  elif stock_total < stock_minimo:
      cantidad_sugerida = stock_maximo - stock_total
  elif stock_total < stock_seguridad:
      cantidad_sugerida = stock_maximo - stock_total
  ```

**Tests necesarios:**
- ✅ Stock bajo punto de reorden → sugiere correctamente
- ✅ Stock bajo mínimo → calcula cantidad correcta
- ✅ Stock bajo seguridad → aplica regla correcta
- ✅ Stock suficiente → no sugiere pedido
- ✅ Conversión de unidades a bultos es correcta
- ✅ Cálculo de pronóstico se integra correctamente
- ❌ Casos edge: stock negativo, divisiones por cero

#### 2. **Forecast de Ventas** (`forecast_pmp.py`)
**Lógica crítica:** Predice ventas futuras usando Promedio Móvil Ponderado.

**Funciones a testear:**
- `calcular_forecast_diario()` - Línea 75
- `calcular_forecast_producto()` - Línea 183
- `calcular_forecast_tienda()` - Línea 296

**Tests necesarios:**
- ✅ Pesos suman 1.0 (40% + 30% + 20% + 10% = 100%)
- ✅ Cálculo correcto con datos históricos conocidos
- ✅ Manejo de productos sin suficientes datos históricos
- ✅ Ajustes estacionales y de tendencia se aplican correctamente
- ✅ Forecast diario por día de semana es correcto
- ✅ Intervalo de confianza (±20%) se calcula bien
- ❌ División por cero en cálculos de bultos
- ❌ Fechas fuera de rango

#### 3. **Análisis de Ventas** (`main.py:927-1065`)
**Lógica crítica:** Cálculos estadísticos sobre ventas históricas.

**Funciones a testear:**
- `get_ventas_detail()` - Línea 927
- Promedios diarios, por día de semana, año anterior

**Tests necesarios:**
- ✅ Promedio diario calcula correctamente
- ✅ Promedio por día de semana es preciso
- ✅ Comparación año anterior funciona
- ✅ Porcentaje del total suma 100%
- ✅ Conversión unidades/bultos es correcta
- ❌ Fechas inválidas o fuera de rango

---

### 🟡 **IMPORTANTES** (Prioridad Media - Correctness de datos)

#### 4. **Conexión a DuckDB**
**Función:** `get_db_connection()` - `main.py:48`

**Tests necesarios:**
- ✅ Conexión exitosa cuando DB existe
- ✅ HTTPException cuando DB no existe
- ✅ Path de DB correcto según DATABASE_PATH env var
- ✅ Cierre de conexión después de queries

#### 5. **ETL Sync Background** (`main.py:634-773`)
**Lógica:** Ejecuta ETL en background sin bloquear API.

**Tests necesarios:**
- ✅ No permite ejecutar ETL simultáneamente
- ✅ Actualiza status correctamente durante ejecución
- ✅ Timeout después de 10 minutos funciona
- ✅ Maneja errores del proceso ETL
- ✅ Parsea correctamente resultados por tienda

#### 6. **Guardar Pedido** (`main.py:1395-1484`)
**Lógica:** Persiste pedidos sugeridos en DB.

**Tests necesarios:**
- ✅ Genera número de pedido secuencial correctamente
- ✅ Calcula totales correctamente (productos, bultos, unidades)
- ✅ Inserta en ambas tablas (pedidos + detalle)
- ✅ Filtra solo productos incluidos
- ✅ Maneja transacciones correctamente

---

### 🟢 **BÁSICAS** (Prioridad Baja - CRUD simple)

#### 7. **Endpoints CRUD básicos**
- `get_ubicaciones()` - Línea 228
- `get_productos()` - Línea 365
- `get_categorias()` - Línea 408
- `get_stock()` - Línea 431

**Tests necesarios:**
- ✅ Retornan datos cuando existen
- ✅ Filtros funcionan correctamente
- ✅ Paginación funciona (si aplica)
- ✅ Manejo de registros vacíos

---

## Plan de Implementación

### Fase 1: Setup de Testing (1 día)
```bash
backend/
├── tests/
│   ├── __init__.py
│   ├── conftest.py          # Fixtures compartidos
│   ├── test_database.py     # Tests de conexión DB
│   └── fixtures/
│       └── sample_data.sql  # Datos de prueba
├── pytest.ini
└── requirements-dev.txt
```

**Dependencias a instalar:**
```txt
pytest==7.4.3
pytest-asyncio==0.21.1
pytest-cov==4.1.0
httpx==0.25.1          # Para TestClient async
faker==20.0.3          # Para generar datos de prueba
freezegun==1.4.0       # Para mockear fechas
```

### Fase 2: Tests Críticos - Pedidos Sugeridos (2 días)

**Archivo:** `tests/test_pedidos_sugeridos.py`

Casos de prueba:
1. ✅ Stock crítico (bajo punto reorden) → pedido correcto
2. ✅ Stock bajo mínimo → cantidad exacta
3. ✅ Stock suficiente → no pedido
4. ✅ Conversión unidades/bultos → redondeo correcto
5. ✅ Integración con forecast → usa pronóstico
6. ❌ Stock negativo → manejo de error
7. ❌ Producto sin ventas → comportamiento definido
8. ❌ División por cero en bultos → prevención

### Fase 3: Tests Críticos - Forecast (2 días)

**Archivo:** `tests/test_forecast_pmp.py`

Casos de prueba:
1. ✅ Pesos suman 100%
2. ✅ Forecast con 4 semanas completas
3. ✅ Forecast con solo 2 semanas (datos limitados)
4. ✅ Forecast diario por día de semana
5. ✅ Ajustes estacionales aplicados
6. ✅ Intervalo confianza ±20%
7. ❌ Sin datos históricos → error manejado
8. ❌ Fechas futuras inválidas

### Fase 4: Tests Críticos - Análisis Ventas (1 día)

**Archivo:** `tests/test_ventas_analysis.py`

Casos de prueba:
1. ✅ Promedio diario correcto
2. ✅ Promedio día de semana (ej: todos los lunes)
3. ✅ Comparación año anterior
4. ✅ Porcentaje del total suma 100%
5. ❌ Rango de fechas inválido

### Fase 5: Tests Importantes - ETL & Persistencia (1 día)

**Archivo:** `tests/test_etl_background.py` y `tests/test_pedidos_guardado.py`

### Fase 6: Tests Básicos - CRUD (1 día)

**Archivo:** `tests/test_crud_endpoints.py`

---

## Fixtures Clave (`conftest.py`)

```python
import pytest
from pathlib import Path
import duckdb
from fastapi.testclient import TestClient

@pytest.fixture(scope="session")
def test_db_path(tmp_path_factory):
    """Crea una DB temporal para tests"""
    db_path = tmp_path_factory.mktemp("data") / "test_fluxion.db"

    # Crear DB y poblar con datos de prueba
    conn = duckdb.connect(str(db_path))

    # Ejecutar schema
    schema_path = Path(__file__).parent.parent.parent / "database" / "schema_extended.sql"
    with open(schema_path) as f:
        conn.execute(f.read())

    # Poblar con datos de prueba
    conn.execute("""
        INSERT INTO ventas_raw (ubicacion_id, codigo_producto, cantidad_vendida, fecha, ...)
        VALUES
            ('tienda_01', '000658', 10, '2024-01-01', ...),
            ...
    """)

    conn.close()
    yield db_path

@pytest.fixture
def client(test_db_path, monkeypatch):
    """Cliente de prueba con DB temporal"""
    monkeypatch.setenv("DATABASE_PATH", str(test_db_path))

    from backend.main import app
    return TestClient(app)

@pytest.fixture
def sample_ventas_data():
    """Datos de ventas de prueba conocidos"""
    return {
        "ubicacion_id": "tienda_01",
        "codigo_producto": "000658",
        "ventas_semana1": 100,  # 40% peso
        "ventas_semana2": 80,   # 30% peso
        "ventas_semana3": 60,   # 20% peso
        "ventas_semana4": 40,   # 10% peso
        # Forecast esperado = (100*0.4 + 80*0.3 + 60*0.2 + 40*0.1) / 7 dias
        "forecast_diario_esperado": 11.43
    }
```

---

## Ejemplo de Test Específico

### `tests/test_pedidos_sugeridos.py`

```python
import pytest
from fastapi.testclient import TestClient

class TestPedidosSugeridos:
    """Tests para la lógica de cálculo de pedidos sugeridos"""

    def test_stock_bajo_punto_reorden_genera_pedido(self, client, test_db_path):
        """
        DADO un producto con:
        - Stock actual: 10 unidades
        - Punto de reorden: 30 unidades
        - Stock máximo: 100 unidades
        - Pronóstico 3 días: 15 unidades

        CUANDO se calcula el pedido sugerido

        ENTONCES debe sugerir: (100 - 10) + 15 = 105 unidades
        Y la razón debe ser "Stock bajo punto de reorden"
        """
        # Arrange
        conn = duckdb.connect(str(test_db_path))
        conn.execute("""
            INSERT INTO inventario_raw (
                ubicacion_id, codigo_producto, cantidad_actual,
                stock_minimo, stock_maximo, punto_reorden, cantidad_bultos
            ) VALUES ('tienda_01', 'PROD_TEST', 10, 20, 100, 30, 6)
        """)

        # Mock de ventas para generar pronóstico de 15 unidades/3días
        conn.execute("""
            INSERT INTO ventas_raw (ubicacion_id, codigo_producto, cantidad_vendida, fecha, dia_semana)
            VALUES
                ('tienda_01', 'PROD_TEST', 5, '2024-01-01', 1),
                ('tienda_01', 'PROD_TEST', 5, '2024-01-02', 2),
                ...
        """)
        conn.close()

        # Act
        response = client.post("/api/pedidos-sugeridos/calcular", json={
            "cedi_origen": "cedi_seco",
            "tienda_destino": "tienda_01",
            "dias_cobertura": 3
        })

        # Assert
        assert response.status_code == 200
        productos = response.json()

        producto_test = [p for p in productos if p["codigo_producto"] == "PROD_TEST"][0]

        assert producto_test["cantidad_sugerida_unid"] == 105
        assert producto_test["razon_pedido"] == "Stock bajo punto de reorden"
        assert producto_test["cantidad_ajustada_bultos"] == 18  # 105/6 = 17.5 → 18 bultos

    def test_stock_suficiente_no_genera_pedido(self, client, test_db_path):
        """
        DADO un producto con stock suficiente (> stock_seguridad)
        CUANDO se calcula el pedido sugerido
        ENTONCES no debe sugerir pedido
        """
        # ... implementación similar
        pass

    def test_conversion_bultos_redondea_correctamente(self, client):
        """
        DADO una cantidad sugerida de 107 unidades
        Y cantidad_bultos = 6 unidades/bulto
        CUANDO se convierte a bultos
        ENTONCES debe redondear a 18 bultos (107/6 = 17.83 → 18)
        """
        # Test unitario de la lógica de redondeo
        cantidad_sugerida = 107
        cantidad_bultos = 6

        cantidad_bultos_sugerida = cantidad_sugerida / cantidad_bultos
        cantidad_bultos_ajustada = int(cantidad_bultos_sugerida) + (
            1 if cantidad_bultos_sugerida % 1 >= 0.5 else 0
        )

        assert cantidad_bultos_ajustada == 18

    @pytest.mark.parametrize("stock_actual,punto_reorden,stock_minimo,stock_seguridad,razon_esperada", [
        (5, 30, 20, 30, "Stock bajo punto de reorden"),
        (15, 30, 20, 30, "Stock bajo mínimo"),
        (25, 30, 20, 30, "Stock bajo seguridad"),
        (35, 30, 20, 30, "Stock suficiente"),
    ])
    def test_diferentes_niveles_stock_razon_correcta(
        self, client, stock_actual, punto_reorden, stock_minimo, stock_seguridad, razon_esperada
    ):
        """Test parametrizado para diferentes niveles de stock"""
        # ... implementación
        pass
```

---

## Métricas de Éxito

### Coverage Objetivo
- **Funciones críticas (forecast, pedidos):** 95%+ coverage
- **Funciones importantes (ETL, guardado):** 85%+ coverage
- **Funciones básicas (CRUD):** 70%+ coverage
- **Coverage total backend:** 80%+

### Comando para ejecutar
```bash
cd backend
pytest tests/ -v --cov=. --cov-report=html --cov-report=term
```

### CI/CD Integration
Agregar a GitHub Actions:
```yaml
- name: Run Backend Tests
  run: |
    cd backend
    pip install -r requirements-dev.txt
    pytest tests/ --cov=. --cov-report=xml

- name: Upload Coverage
  uses: codecov/codecov-action@v3
```

---

## Riesgos y Consideraciones

### ⚠️ Riesgos Detectados en el Código

1. **División por cero** (forecast_pmp.py:170, 275)
   ```python
   forecast_bultos = forecast_unidades / float(unid_bulto) if unid_bulto > 0 else 0.0
   ```
   ✅ **Ya tiene protección**

2. **SQL Injection en queries dinámicas** (main.py:1108-1267)
   ```python
   query = f"""
   WHERE v.ubicacion_id = '{request.tienda_destino}'
   ```
   ⚠️ **Usar parámetros preparados en lugar de f-strings**

3. **Timeout de ETL** (main.py:661)
   - Timeout fijo de 600s (10 min)
   - ✅ Está manejado con asyncio.TimeoutError

4. **Números de pedido no concurrentes** (main.py:1414-1417)
   ```python
   resultado = conn.execute("SELECT MAX(numero_pedido)...")
   siguiente_numero = int(ultimo_numero.split('-')[1]) + 1
   ```
   ⚠️ **Race condition posible si hay requests simultáneas**

---

## Siguientes Pasos

1. ✅ Revisar y aprobar esta estrategia
2. ⚙️ Crear estructura de tests (`tests/` folder)
3. 📦 Instalar dependencias de testing
4. 🧪 Implementar tests de Fase 1 (Setup)
5. 🔴 Implementar tests críticos (Fases 2-4)
6. 🟡 Implementar tests importantes (Fase 5)
7. 🟢 Implementar tests básicos (Fase 6)
8. 📊 Generar reporte de coverage
9. 🔄 Integrar en CI/CD

---

## Tiempo Estimado Total

- **Setup inicial:** 1 día
- **Tests críticos:** 5 días
- **Tests importantes:** 1 día
- **Tests básicos:** 1 día
- **Refactoring y fixes:** 1 día
- **Documentación:** 0.5 días

**Total: ~9.5 días** de desarrollo

---

## Beneficios Esperados

1. ✅ **Confianza en lógica de negocio:** Tests verifican que cálculos críticos (pedidos, forecast) son correctos
2. ✅ **Prevención de regresiones:** Cambios futuros no rompen lógica existente
3. ✅ **Documentación viva:** Tests sirven como ejemplos de uso
4. ✅ **Deployment seguro:** CI/CD bloquea merges con tests fallidos
5. ✅ **Debugging más rápido:** Tests aíslan problemas específicos
6. ✅ **Refactoring seguro:** Permite mejorar código sin miedo a romper funcionalidad
