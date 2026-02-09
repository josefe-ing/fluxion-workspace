"""
Pytest fixtures for Fluxion AI Backend tests.

Integration tests (those needing a database) are automatically skipped
when TEST_DATABASE_URL is not set. This allows CI to run unit tests
without a database while developers can run the full suite locally.

Usage:
    # Run unit tests only (CI default):
    pytest

    # Run all tests including integration (requires PostgreSQL):
    TEST_DATABASE_URL=postgresql://user:pass@localhost:5432/fluxion_test pytest
"""

import os

import pytest

# ---------------------------------------------------------------------------
# Database availability check
# ---------------------------------------------------------------------------

TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL")

_requires_db = pytest.mark.skipif(
    not TEST_DATABASE_URL,
    reason="No test database available (set TEST_DATABASE_URL)",
)


def pytest_collection_modifyitems(items):
    """Auto-skip tests that use DB fixtures when no database is configured."""
    db_fixtures = {
        "client", "db_conn", "inventario_stock_critico",
        "inventario_stock_suficiente", "ventas_historicas_8_semanas",
        "sample_cedi", "sample_ubicacion", "sample_producto",
    }
    for item in items:
        if db_fixtures & set(item.fixturenames):
            item.add_marker(_requires_db)


# ---------------------------------------------------------------------------
# Database fixtures (only used when TEST_DATABASE_URL is set)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def _db_connection():
    """Session-scoped raw database connection."""
    if not TEST_DATABASE_URL:
        pytest.skip("No test database")

    import psycopg2
    conn = psycopg2.connect(TEST_DATABASE_URL)
    yield conn
    conn.close()


@pytest.fixture
def db_conn(_db_connection):
    """Per-test database connection with automatic rollback."""
    _db_connection.rollback()
    yield _db_connection
    _db_connection.rollback()


@pytest.fixture
def client():
    """FastAPI TestClient."""
    if not TEST_DATABASE_URL:
        pytest.skip("No test database")

    from fastapi.testclient import TestClient
    # Import after ensuring deps are available
    import sys
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    from main import app

    with TestClient(app) as c:
        yield c


# ---------------------------------------------------------------------------
# Sample data fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def sample_ubicacion():
    return {
        "ubicacion_id": "test_tienda_001",
        "ubicacion_nombre": "Tienda Test",
        "tipo_ubicacion": "tienda",
    }


@pytest.fixture
def sample_cedi():
    return {
        "ubicacion_id": "test_cedi_seco",
        "ubicacion_nombre": "CEDI Seco Test",
        "tipo_ubicacion": "cedi",
    }


@pytest.fixture
def sample_producto():
    return {
        "codigo_producto": "PROD_TEST_001",
        "descripcion_producto": "Producto de Prueba",
        "categoria": "Abarrotes",
        "cantidad_bultos": 6.0,
    }


@pytest.fixture
def inventario_stock_critico(sample_ubicacion):
    return {
        **sample_ubicacion,
        "codigo_producto": "PROD_CRITICO",
        "descripcion_producto": "Producto Stock Crítico",
        "categoria": "Abarrotes",
        "cantidad_actual": 10.0,
        "cantidad_en_transito": 0.0,
        "cantidad_bultos": 6.0,
        "stock_minimo": 20.0,
        "stock_maximo": 100.0,
        "punto_reorden": 30.0,
    }


@pytest.fixture
def inventario_stock_suficiente(sample_ubicacion):
    return {
        **sample_ubicacion,
        "codigo_producto": "PROD_SUFICIENTE",
        "descripcion_producto": "Producto Stock Suficiente",
        "categoria": "Abarrotes",
        "cantidad_actual": 80.0,
        "cantidad_en_transito": 0.0,
        "cantidad_bultos": 6.0,
        "stock_minimo": 20.0,
        "stock_maximo": 100.0,
        "punto_reorden": 30.0,
    }


@pytest.fixture
def ventas_historicas_8_semanas(db_conn, sample_ubicacion, inventario_stock_critico):
    """Insert 8 weeks of historical sales data for integration tests."""
    from datetime import datetime, timedelta

    codigo = inventario_stock_critico["codigo_producto"]
    ubicacion_id = sample_ubicacion["ubicacion_id"]
    base_date = datetime.now() - timedelta(weeks=8)

    for week in range(8):
        fecha = (base_date + timedelta(weeks=week)).strftime("%Y-%m-%d")
        dia_semana = (base_date + timedelta(weeks=week)).weekday() + 1
        db_conn.execute("""
            INSERT INTO ventas_raw (
                ubicacion_id, codigo_producto, descripcion_producto,
                categoria_producto, cantidad_vendida, cantidad_bultos,
                fecha, dia_semana, numero_factura, activo
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, [
            ubicacion_id,
            codigo,
            inventario_stock_critico["descripcion_producto"],
            inventario_stock_critico["categoria"],
            80.0,  # ~11.43/day
            6.0,
            fecha,
            dia_semana,
            f"FAC-TEST-{week}",
            True,
        ])
    db_conn.commit()
