"""
Pytest fixtures and configuration for Fluxion AI Backend tests
"""

import pytest
import duckdb
from pathlib import Path
from datetime import datetime, timedelta
from fastapi.testclient import TestClient
import os

# ============================================================================
# Database Fixtures
# ============================================================================

@pytest.fixture(scope="session")
def test_db_path(tmp_path_factory):
    """
    Crea una base de datos DuckDB temporal para tests.
    Se crea una vez por sesión de testing.
    """
    db_path = tmp_path_factory.mktemp("data") / "test_fluxion.db"

    conn = duckdb.connect(str(db_path))

    # Crear tablas necesarias para tests
    conn.execute("""
        CREATE TABLE inventario_raw (
            ubicacion_id VARCHAR,
            ubicacion_nombre VARCHAR,
            tipo_ubicacion VARCHAR,
            codigo_producto VARCHAR,
            codigo_barras VARCHAR,
            descripcion_producto VARCHAR,
            categoria VARCHAR,
            subcategoria VARCHAR,
            marca VARCHAR,
            presentacion VARCHAR,
            cantidad_actual DECIMAL(12,4),
            cantidad_en_transito DECIMAL(12,4),
            cantidad_bultos DECIMAL(12,4),
            precio_venta_actual DECIMAL(12,4),
            stock_minimo DECIMAL(12,4),
            stock_maximo DECIMAL(12,4),
            punto_reorden DECIMAL(12,4),
            clasificacion_abc VARCHAR,
            estado_stock VARCHAR,
            activo BOOLEAN DEFAULT true,
            fecha_extraccion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            dias_sin_movimiento INTEGER
        )
    """)

    conn.execute("""
        CREATE TABLE ventas_raw (
            ubicacion_id VARCHAR,
            ubicacion_nombre VARCHAR,
            codigo_producto VARCHAR,
            descripcion_producto VARCHAR,
            categoria_producto VARCHAR,
            cantidad_vendida DECIMAL(12,4),
            cantidad_bultos DECIMAL(12,4),
            fecha VARCHAR,
            dia_semana INTEGER,
            numero_factura VARCHAR,
            activo BOOLEAN DEFAULT true
        )
    """)

    conn.execute("""
        CREATE TABLE pedidos_sugeridos (
            id VARCHAR PRIMARY KEY,
            numero_pedido VARCHAR UNIQUE,
            cedi_origen_id VARCHAR,
            cedi_origen_nombre VARCHAR,
            tienda_destino_id VARCHAR,
            tienda_destino_nombre VARCHAR,
            estado VARCHAR,
            total_productos INTEGER,
            total_bultos DECIMAL(12,4),
            total_unidades DECIMAL(12,4),
            dias_cobertura INTEGER,
            observaciones TEXT,
            fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            usuario_creador VARCHAR,
            fecha_modificacion TIMESTAMP
        )
    """)

    conn.execute("""
        CREATE TABLE pedidos_sugeridos_detalle (
            id VARCHAR PRIMARY KEY,
            pedido_id VARCHAR,
            linea_numero INTEGER,
            codigo_producto VARCHAR,
            descripcion_producto VARCHAR,
            cantidad_bultos DECIMAL(12,4),
            cantidad_pedida_bultos INTEGER,
            cantidad_pedida_unidades DECIMAL(12,4),
            cantidad_sugerida_bultos INTEGER,
            cantidad_sugerida_unidades DECIMAL(12,4),
            clasificacion_abc VARCHAR,
            razon_pedido VARCHAR,
            incluido BOOLEAN,
            prom_ventas_8sem_unid DECIMAL(12,4),
            prom_ventas_8sem_bultos DECIMAL(12,4),
            stock_tienda DECIMAL(12,4),
            stock_total DECIMAL(12,4)
        )
    """)

    conn.close()

    yield db_path

    # Cleanup - eliminar DB temporal después de todos los tests
    if db_path.exists():
        db_path.unlink()


@pytest.fixture
def db_conn(test_db_path):
    """
    Conexión a la base de datos de prueba.
    Se crea una nueva conexión para cada test.
    """
    conn = duckdb.connect(str(test_db_path))
    yield conn
    conn.close()


@pytest.fixture(autouse=True)
def clean_db(db_conn):
    """
    Limpia todas las tablas antes de cada test.
    autouse=True significa que se ejecuta automáticamente.
    """
    db_conn.execute("DELETE FROM inventario_raw")
    db_conn.execute("DELETE FROM ventas_raw")
    db_conn.execute("DELETE FROM pedidos_sugeridos")
    db_conn.execute("DELETE FROM pedidos_sugeridos_detalle")
    yield


# ============================================================================
# FastAPI Client Fixtures
# ============================================================================

@pytest.fixture
def client(test_db_path, monkeypatch):
    """
    Cliente de prueba para FastAPI.
    Configura la variable de entorno DATABASE_PATH para usar la DB de prueba.
    """
    monkeypatch.setenv("DATABASE_PATH", str(test_db_path))

    # Importar app después de setear el env var
    from main import app

    return TestClient(app)


# ============================================================================
# Data Fixtures - Productos y Ubicaciones
# ============================================================================

@pytest.fixture
def sample_producto():
    """Datos de ejemplo para un producto"""
    return {
        "codigo_producto": "PROD_TEST_001",
        "codigo_barras": "7501234567890",
        "descripcion_producto": "Producto de Prueba 1",
        "categoria": "Abarrotes",
        "subcategoria": "Enlatados",
        "marca": "Marca Test",
        "presentacion": "1 kg",
        "cantidad_bultos": 6.0,  # 6 unidades por bulto
    }


@pytest.fixture
def sample_ubicacion():
    """Datos de ejemplo para una ubicación"""
    return {
        "ubicacion_id": "tienda_01",
        "ubicacion_nombre": "Tienda Centro",
        "tipo_ubicacion": "tienda"
    }


@pytest.fixture
def sample_cedi():
    """Datos de ejemplo para un CEDI"""
    return {
        "ubicacion_id": "cedi_seco",
        "ubicacion_nombre": "CEDI Seco",
        "tipo_ubicacion": "cedi"
    }


# ============================================================================
# Data Fixtures - Inventario
# ============================================================================

@pytest.fixture
def inventario_stock_critico(db_conn, sample_producto, sample_ubicacion):
    """
    Producto con stock crítico (bajo punto de reorden).

    Configuración:
    - Stock actual: 10 unidades
    - Punto de reorden: 30 unidades
    - Stock mínimo: 20 unidades
    - Stock máximo: 100 unidades
    - Stock seguridad: 30 unidades (mínimo * 1.5)
    """
    db_conn.execute("""
        INSERT INTO inventario_raw (
            ubicacion_id, ubicacion_nombre, tipo_ubicacion,
            codigo_producto, codigo_barras, descripcion_producto,
            categoria, subcategoria, marca, presentacion,
            cantidad_actual, cantidad_en_transito, cantidad_bultos,
            stock_minimo, stock_maximo, punto_reorden,
            clasificacion_abc, estado_stock, activo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, [
        sample_ubicacion["ubicacion_id"],
        sample_ubicacion["ubicacion_nombre"],
        sample_ubicacion["tipo_ubicacion"],
        sample_producto["codigo_producto"],
        sample_producto["codigo_barras"],
        sample_producto["descripcion_producto"],
        sample_producto["categoria"],
        sample_producto["subcategoria"],
        sample_producto["marca"],
        sample_producto["presentacion"],
        10.0,  # cantidad_actual
        0.0,   # cantidad_en_transito
        sample_producto["cantidad_bultos"],
        20.0,  # stock_minimo
        100.0, # stock_maximo
        30.0,  # punto_reorden
        "A",   # clasificacion_abc
        "critico",
        True
    ])

    return {
        **sample_producto,
        "ubicacion_id": sample_ubicacion["ubicacion_id"],
        "stock_actual": 10.0,
        "stock_en_transito": 0.0,
        "stock_minimo": 20.0,
        "stock_maximo": 100.0,
        "punto_reorden": 30.0,
        "stock_seguridad": 30.0  # 20.0 * 1.5
    }


@pytest.fixture
def inventario_stock_suficiente(db_conn, sample_producto, sample_ubicacion):
    """
    Producto con stock suficiente (sobre stock de seguridad).

    Configuración:
    - Stock actual: 80 unidades
    - Stock seguridad: 30 unidades
    """
    # Usar un código diferente para evitar conflictos
    codigo_producto = "PROD_TEST_002"

    db_conn.execute("""
        INSERT INTO inventario_raw (
            ubicacion_id, ubicacion_nombre, tipo_ubicacion,
            codigo_producto, descripcion_producto,
            categoria, cantidad_actual, cantidad_en_transito, cantidad_bultos,
            stock_minimo, stock_maximo, punto_reorden,
            clasificacion_abc, activo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, [
        sample_ubicacion["ubicacion_id"],
        sample_ubicacion["ubicacion_nombre"],
        sample_ubicacion["tipo_ubicacion"],
        codigo_producto,
        "Producto Stock Suficiente",
        sample_producto["categoria"],
        80.0,  # cantidad_actual
        0.0,   # cantidad_en_transito
        sample_producto["cantidad_bultos"],
        20.0,  # stock_minimo
        100.0, # stock_maximo
        30.0,  # punto_reorden
        "B",
        True
    ])

    return {
        "codigo_producto": codigo_producto,
        "ubicacion_id": sample_ubicacion["ubicacion_id"],
        "stock_actual": 80.0,
        "stock_minimo": 20.0,
        "stock_maximo": 100.0,
        "punto_reorden": 30.0,
    }


# ============================================================================
# Data Fixtures - Ventas
# ============================================================================

@pytest.fixture
def ventas_historicas_8_semanas(db_conn, sample_producto, sample_ubicacion):
    """
    Genera ventas históricas para 8 semanas (56 días).

    Patrón de ventas:
    - Semana 1 (última): 100 unidades/semana = 14.29 unidades/día
    - Semana 2: 80 unidades/semana = 11.43 unidades/día
    - Semana 3: 60 unidades/semana = 8.57 unidades/día
    - Semana 4: 40 unidades/semana = 5.71 unidades/día
    - Semanas 5-8: 50 unidades/semana promedio

    Forecast esperado (PMP con pesos 40%, 30%, 20%, 10%):
    = (14.29 * 0.4) + (11.43 * 0.3) + (8.57 * 0.2) + (5.71 * 0.1)
    = 5.72 + 3.43 + 1.71 + 0.57
    = 11.43 unidades/día
    """
    fecha_base = datetime.now().date()
    ventas = []

    # Generar ventas para 56 días (8 semanas)
    for dia in range(56):
        fecha = fecha_base - timedelta(days=dia + 1)

        # Determinar cantidad según semana
        if dia < 7:  # Última semana (semana 1)
            cantidad_diaria = 14.29
        elif dia < 14:  # Semana 2
            cantidad_diaria = 11.43
        elif dia < 21:  # Semana 3
            cantidad_diaria = 8.57
        elif dia < 28:  # Semana 4
            cantidad_diaria = 5.71
        else:  # Semanas 5-8
            cantidad_diaria = 7.14  # ~50/semana

        dia_semana = fecha.isoweekday()  # 1=Lun, 7=Dom

        ventas.append((
            sample_ubicacion["ubicacion_id"],
            sample_ubicacion["ubicacion_nombre"],
            sample_producto["codigo_producto"],
            sample_producto["descripcion_producto"],
            sample_producto["categoria"],
            cantidad_diaria,
            sample_producto["cantidad_bultos"],
            fecha.strftime("%Y-%m-%d"),
            dia_semana,
            f"FAC-{fecha.strftime('%Y%m%d')}-001",
            True
        ))

    # Insertar todas las ventas
    db_conn.executemany("""
        INSERT INTO ventas_raw (
            ubicacion_id, ubicacion_nombre, codigo_producto,
            descripcion_producto, categoria_producto, cantidad_vendida,
            cantidad_bultos, fecha, dia_semana, numero_factura, activo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, ventas)

    return {
        "total_registros": len(ventas),
        "fecha_inicio": (fecha_base - timedelta(days=56)).strftime("%Y-%m-%d"),
        "fecha_fin": (fecha_base - timedelta(days=1)).strftime("%Y-%m-%d"),
        "forecast_diario_esperado": 11.43,  # Según cálculo PMP
        "forecast_3dias_esperado": 11.43 * 3  # ~34.29 unidades
    }


# ============================================================================
# Assertion Helpers
# ============================================================================

def assert_pedido_calculado_correctamente(producto, expected):
    """
    Helper para validar que un producto pedido fue calculado correctamente.

    Args:
        producto: Dict con los datos del producto calculado
        expected: Dict con valores esperados
    """
    assert producto["codigo_producto"] == expected["codigo_producto"]
    assert abs(producto["cantidad_sugerida_unid"] - expected["cantidad_sugerida_unid"]) < 0.1
    assert producto["razon_pedido"] == expected["razon_pedido"]

    if "cantidad_ajustada_bultos" in expected:
        assert producto["cantidad_ajustada_bultos"] == expected["cantidad_ajustada_bultos"]
