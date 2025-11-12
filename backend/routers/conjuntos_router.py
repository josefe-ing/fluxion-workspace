"""
Router para Conjuntos Sustituibles (Pronóstico Jerárquico)
Gestión de productos intercambiables para optimización de inventario
"""

from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional
import duckdb
from pathlib import Path
from datetime import date, datetime
from decimal import Decimal
import uuid

from models.conjuntos import (
    Conjunto,
    ConjuntoCreate,
    ConjuntoUpdate,
    ConjuntoListResponse,
    ConjuntoDetalleResponse,
    ConjuntoProducto,
    ConjuntoProductoCreate,
    ConjuntoProductoUpdate,
    PronosticoJerarquicoResponse,
    ProductoDistribucion,
    Alerta,
    SimulacionStockout,
    SimulacionStockoutResponse,
    SharesConjuntoResponse,
    ShareProducto
)

router = APIRouter(prefix="/api/conjuntos", tags=["Conjuntos Sustituibles"])

# Path a la base de datos
DB_PATH = Path(__file__).parent.parent.parent / "data" / "fluxion_production.db"


# =====================================================================================
# ENDPOINTS CRUD - CONJUNTOS
# =====================================================================================

@router.get("/", response_model=ConjuntoListResponse)
async def list_conjuntos(
    activo: Optional[bool] = None,
    categoria: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500)
):
    """
    Listar todos los conjuntos sustituibles.

    Filters:
    - activo: Filtrar por conjuntos activos/inactivos
    - categoria: Filtrar por categoría
    - skip/limit: Paginación
    """
    try:
        conn = duckdb.connect(str(DB_PATH), read_only=True)

        # Construir query con filtros
        where_clauses = []
        if activo is not None:
            where_clauses.append(f"c.activo = {activo}")
        if categoria:
            where_clauses.append(f"c.categoria = '{categoria}'")

        where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

        # Query principal con estadísticas
        query = f"""
        SELECT
            c.id,
            c.nombre,
            c.descripcion,
            c.categoria,
            c.activo,
            c.fecha_creacion,
            c.fecha_creacion as fecha_actualizacion,
            COUNT(DISTINCT cp.codigo_producto) as total_productos,
            COUNT(DISTINCT CASE WHEN cp.activo THEN cp.codigo_producto END) as productos_activos,
            0.0 as demanda_diaria_total
        FROM conjuntos_sustituibles c
        LEFT JOIN conjunto_productos cp ON c.id = cp.conjunto_id
        {where_sql}
        GROUP BY c.id, c.nombre, c.descripcion, c.categoria, c.activo, c.fecha_creacion
        ORDER BY c.nombre
        LIMIT {limit} OFFSET {skip}
        """

        results = conn.execute(query).fetchall()

        # Convertir a modelos
        conjuntos = []
        for row in results:
            conjuntos.append(Conjunto(
                id=row[0],
                nombre=row[1],
                descripcion=row[2],
                categoria=row[3],
                activo=row[4],
                fecha_creacion=row[5],
                fecha_actualizacion=row[6],
                total_productos=row[7] or 0,
                productos_activos=row[8] or 0,
                demanda_diaria_total=Decimal(str(row[9])) if row[9] else Decimal('0')
            ))

        # Count total
        count_query = f"""
        SELECT COUNT(DISTINCT c.id)
        FROM conjuntos_sustituibles c
        {where_sql}
        """
        total = conn.execute(count_query).fetchone()[0]

        conn.close()

        return ConjuntoListResponse(conjuntos=conjuntos, total=total)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al listar conjuntos: {str(e)}")


@router.get("/{conjunto_id}", response_model=ConjuntoDetalleResponse)
async def get_conjunto(conjunto_id: str):
    """
    Obtener detalle de un conjunto específico con sus productos.
    """
    try:
        conn = duckdb.connect(str(DB_PATH), read_only=True)

        # Obtener conjunto
        conjunto_query = """
        SELECT id, nombre, descripcion, categoria, activo, fecha_creacion, fecha_creacion as fecha_actualizacion
        FROM conjuntos_sustituibles
        WHERE id = ?
        """
        conjunto_row = conn.execute(conjunto_query, [conjunto_id]).fetchone()

        if not conjunto_row:
            raise HTTPException(status_code=404, detail=f"Conjunto {conjunto_id} no encontrado")

        conjunto = Conjunto(
            id=conjunto_row[0],
            nombre=conjunto_row[1],
            descripcion=conjunto_row[2],
            categoria=conjunto_row[3],
            activo=conjunto_row[4],
            fecha_creacion=conjunto_row[5],
            fecha_actualizacion=conjunto_row[6]
        )

        # Obtener productos del conjunto
        productos_query = """
        SELECT
            cp.id,
            cp.conjunto_id,
            cp.codigo_producto,
            cp.share_manual,
            cp.activo,
            cp.fecha_agregado,
            p.descripcion,
            p.categoria,
            p.marca,
            COALESCE(cp.share_manual, 0) as share_porcentaje,
            0.0 as demanda_diaria,
            0.0 as stock_actual,
            0.0 as dias_inventario
        FROM conjunto_productos cp
        LEFT JOIN productos p ON cp.codigo_producto = p.codigo
        WHERE cp.conjunto_id = ?
        ORDER BY COALESCE(cp.share_manual, 0) DESC
        """

        productos_rows = conn.execute(productos_query, [conjunto_id]).fetchall()

        productos = []
        for row in productos_rows:
            productos.append(ConjuntoProducto(
                id=row[0],
                conjunto_id=row[1],
                codigo_producto=row[2],
                share_manual=Decimal(str(row[3])) if row[3] else None,
                activo=row[4],
                fecha_agregado=row[5],
                descripcion=row[6],
                categoria=row[7],
                marca=row[8],
                share_porcentaje=Decimal(str(row[9])),
                demanda_diaria=Decimal(str(row[10])),
                stock_actual=Decimal(str(row[11])),
                dias_inventario=Decimal(str(row[12])) if row[12] else None
            ))

        conn.close()

        return ConjuntoDetalleResponse(
            conjunto=conjunto,
            productos=productos,
            demanda_total_diaria=Decimal('0.0')  # TODO: Calcular de ventas reales
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener conjunto: {str(e)}")


@router.post("/", response_model=Conjunto, status_code=201)
async def create_conjunto(conjunto: ConjuntoCreate):
    """
    Crear un nuevo conjunto sustituible.
    """
    try:
        conn = duckdb.connect(str(DB_PATH))

        # Generar ID único
        conjunto_id = f"conjunto_{uuid.uuid4().hex[:12]}"
        now = datetime.now()

        # Insertar conjunto
        insert_query = """
        INSERT INTO conjuntos_sustituibles (id, nombre, descripcion, categoria, activo, fecha_creacion, fecha_modificacion)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """

        conn.execute(insert_query, [
            conjunto_id,
            conjunto.nombre,
            conjunto.descripcion,
            conjunto.categoria,
            conjunto.activo,
            now,
            now
        ])

        conn.close()

        # Retornar conjunto creado
        return Conjunto(
            id=conjunto_id,
            nombre=conjunto.nombre,
            descripcion=conjunto.descripcion,
            categoria=conjunto.categoria,
            activo=conjunto.activo,
            fecha_creacion=now,
            fecha_actualizacion=now
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al crear conjunto: {str(e)}")


@router.put("/{conjunto_id}", response_model=Conjunto)
async def update_conjunto(conjunto_id: str, conjunto: ConjuntoUpdate):
    """
    Actualizar un conjunto existente.
    """
    try:
        conn = duckdb.connect(str(DB_PATH))

        # Verificar que existe
        exists = conn.execute("SELECT COUNT(*) FROM conjuntos_sustituibles WHERE id = ?", [conjunto_id]).fetchone()[0]
        if not exists:
            raise HTTPException(status_code=404, detail=f"Conjunto {conjunto_id} no encontrado")

        # Construir UPDATE dinámico
        updates = []
        params = []

        if conjunto.nombre is not None:
            updates.append("nombre = ?")
            params.append(conjunto.nombre)
        if conjunto.descripcion is not None:
            updates.append("descripcion = ?")
            params.append(conjunto.descripcion)
        if conjunto.categoria is not None:
            updates.append("categoria = ?")
            params.append(conjunto.categoria)
        if conjunto.activo is not None:
            updates.append("activo = ?")
            params.append(conjunto.activo)

        if not updates:
            raise HTTPException(status_code=400, detail="No hay campos para actualizar")

        updates.append("fecha_modificacion = ?")
        params.append(datetime.now())
        params.append(conjunto_id)

        update_query = f"""
        UPDATE conjuntos_sustituibles
        SET {', '.join(updates)}
        WHERE id = ?
        """

        conn.execute(update_query, params)

        # Obtener conjunto actualizado
        updated_row = conn.execute(
            "SELECT id, nombre, descripcion, categoria, activo, fecha_creacion, fecha_modificacion FROM conjuntos_sustituibles WHERE id = ?",
            [conjunto_id]
        ).fetchone()

        conn.close()

        return Conjunto(
            id=updated_row[0],
            nombre=updated_row[1],
            descripcion=updated_row[2],
            categoria=updated_row[3],
            activo=updated_row[4],
            fecha_creacion=updated_row[5],
            fecha_actualizacion=updated_row[6]
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al actualizar conjunto: {str(e)}")


@router.delete("/{conjunto_id}", status_code=204)
async def delete_conjunto(conjunto_id: str):
    """
    Eliminar (desactivar) un conjunto.
    """
    try:
        conn = duckdb.connect(str(DB_PATH))

        # Verificar que existe
        exists = conn.execute("SELECT COUNT(*) FROM conjuntos_sustituibles WHERE id = ?", [conjunto_id]).fetchone()[0]
        if not exists:
            raise HTTPException(status_code=404, detail=f"Conjunto {conjunto_id} no encontrado")

        # Desactivar en lugar de eliminar
        conn.execute("UPDATE conjuntos_sustituibles SET activo = false, fecha_modificacion = ? WHERE id = ?", [datetime.now(), conjunto_id])

        conn.close()

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al eliminar conjunto: {str(e)}")


# =====================================================================================
# ENDPOINTS - PRODUCTOS EN CONJUNTO
# =====================================================================================

@router.post("/{conjunto_id}/productos", response_model=ConjuntoProducto, status_code=201)
async def add_producto_to_conjunto(conjunto_id: str, producto: ConjuntoProductoCreate):
    """
    Agregar un producto a un conjunto.
    """
    try:
        conn = duckdb.connect(str(DB_PATH))

        # Verificar que conjunto existe
        conjunto_exists = conn.execute("SELECT COUNT(*) FROM conjuntos_sustituibles WHERE id = ?", [conjunto_id]).fetchone()[0]
        if not conjunto_exists:
            raise HTTPException(status_code=404, detail=f"Conjunto {conjunto_id} no encontrado")

        # Verificar que producto existe
        producto_exists = conn.execute("SELECT COUNT(*) FROM productos WHERE codigo = ?", [producto.codigo_producto]).fetchone()[0]
        if not producto_exists:
            raise HTTPException(status_code=404, detail=f"Producto {producto.codigo_producto} no encontrado")

        # Verificar que no está ya en el conjunto
        already_in = conn.execute(
            "SELECT COUNT(*) FROM conjunto_productos WHERE conjunto_id = ? AND codigo_producto = ?",
            [conjunto_id, producto.codigo_producto]
        ).fetchone()[0]

        if already_in:
            raise HTTPException(status_code=400, detail=f"Producto {producto.codigo_producto} ya está en el conjunto")

        # Generar ID y agregar
        producto_id = f"cp_{uuid.uuid4().hex[:12]}"
        now = datetime.now()

        insert_query = """
        INSERT INTO conjunto_productos (id, conjunto_id, codigo_producto, share_manual, activo, fecha_agregado)
        VALUES (?, ?, ?, ?, ?, ?)
        """

        conn.execute(insert_query, [
            producto_id,
            conjunto_id,
            producto.codigo_producto,
            float(producto.share_manual) if producto.share_manual else None,
            producto.activo,
            now
        ])

        # Obtener info del producto
        prod_info = conn.execute(
            "SELECT descripcion, categoria, marca FROM productos WHERE codigo = ?",
            [producto.codigo_producto]
        ).fetchone()

        conn.close()

        return ConjuntoProducto(
            id=producto_id,
            conjunto_id=conjunto_id,
            codigo_producto=producto.codigo_producto,
            share_manual=producto.share_manual,
            activo=producto.activo,
            fecha_agregado=now,
            descripcion=prod_info[0] if prod_info else None,
            categoria=prod_info[1] if prod_info else None,
            marca=prod_info[2] if prod_info else None
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al agregar producto: {str(e)}")


@router.put("/{conjunto_id}/productos/{codigo_producto}", response_model=ConjuntoProducto)
async def update_producto_in_conjunto(conjunto_id: str, codigo_producto: str, producto: ConjuntoProductoUpdate):
    """
    Actualizar share o estado de un producto en el conjunto.
    """
    try:
        conn = duckdb.connect(str(DB_PATH))

        # Verificar que existe la relación
        exists = conn.execute(
            "SELECT COUNT(*) FROM conjunto_productos WHERE conjunto_id = ? AND codigo_producto = ?",
            [conjunto_id, codigo_producto]
        ).fetchone()[0]

        if not exists:
            raise HTTPException(status_code=404, detail=f"Producto {codigo_producto} no encontrado en conjunto {conjunto_id}")

        # Construir UPDATE
        updates = []
        params = []

        if producto.share_manual is not None:
            updates.append("share_manual = ?")
            params.append(float(producto.share_manual))
        if producto.activo is not None:
            updates.append("activo = ?")
            params.append(producto.activo)

        if not updates:
            raise HTTPException(status_code=400, detail="No hay campos para actualizar")

        params.extend([conjunto_id, codigo_producto])

        update_query = f"""
        UPDATE conjunto_productos
        SET {', '.join(updates)}
        WHERE conjunto_id = ? AND codigo_producto = ?
        """

        conn.execute(update_query, params)

        # Obtener registro actualizado con info de producto
        updated = conn.execute("""
            SELECT cp.id, cp.conjunto_id, cp.codigo_producto, cp.share_manual, cp.activo, cp.fecha_agregado,
                   p.descripcion, p.categoria, p.marca
            FROM conjunto_productos cp
            LEFT JOIN productos p ON cp.codigo_producto = p.codigo
            WHERE cp.conjunto_id = ? AND cp.codigo_producto = ?
        """, [conjunto_id, codigo_producto]).fetchone()

        conn.close()

        return ConjuntoProducto(
            id=updated[0],
            conjunto_id=updated[1],
            codigo_producto=updated[2],
            share_manual=Decimal(str(updated[3])) if updated[3] else None,
            activo=updated[4],
            fecha_agregado=updated[5],
            descripcion=updated[6],
            categoria=updated[7],
            marca=updated[8]
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al actualizar producto: {str(e)}")


@router.delete("/{conjunto_id}/productos/{codigo_producto}", status_code=204)
async def remove_producto_from_conjunto(conjunto_id: str, codigo_producto: str):
    """
    Remover un producto de un conjunto.
    """
    try:
        conn = duckdb.connect(str(DB_PATH))

        # Verificar que existe
        exists = conn.execute(
            "SELECT COUNT(*) FROM conjunto_productos WHERE conjunto_id = ? AND codigo_producto = ?",
            [conjunto_id, codigo_producto]
        ).fetchone()[0]

        if not exists:
            raise HTTPException(status_code=404, detail=f"Producto {codigo_producto} no encontrado en conjunto {conjunto_id}")

        # Eliminar
        conn.execute(
            "DELETE FROM conjunto_productos WHERE conjunto_id = ? AND codigo_producto = ?",
            [conjunto_id, codigo_producto]
        )

        conn.close()

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al remover producto: {str(e)}")


# =====================================================================================
# ENDPOINT - PRONÓSTICO JERÁRQUICO (CORE LOGIC)
# =====================================================================================

@router.get("/{conjunto_id}/pronostico", response_model=PronosticoJerarquicoResponse)
async def get_pronostico_jerarquico(
    conjunto_id: str,
    ubicacion_id: Optional[str] = None,
    dias: int = Query(7, ge=1, le=90)
):
    """
    Generar pronóstico jerárquico con redistribución automática.

    Este es el endpoint CORE que implementa la lógica de:
    1. Calcular demanda total del conjunto
    2. Calcular shares de cada producto
    3. Verificar disponibilidad en CD
    4. Redistribuir demanda si hay stockouts

    Ejemplo del caso azúcar:
    - Si falta Marca A (50% share), su demanda se redistribuye proporcionalmente
      entre Marca B y C según sus shares relativos.
    """
    try:
        conn = duckdb.connect(str(DB_PATH), read_only=True)

        # Verificar que conjunto existe
        conjunto_row = conn.execute(
            "SELECT id, nombre FROM conjuntos_sustituibles WHERE id = ?",
            [conjunto_id]
        ).fetchone()

        if not conjunto_row:
            raise HTTPException(status_code=404, detail=f"Conjunto {conjunto_id} no encontrado")

        conjunto_nombre = conjunto_row[1]

        # PASO 1: Obtener productos del conjunto con shares
        productos_query = """
        SELECT
            cp.codigo_producto,
            p.descripcion,
            p.marca,
            COALESCE(cp.share_manual, 33.33) as share_original,  -- Default si no hay manual ni histórico
            0.0 as stock_actual,
            0.0 as stock_cd
        FROM conjunto_productos cp
        LEFT JOIN productos p ON cp.codigo_producto = p.codigo
        WHERE cp.conjunto_id = ? AND cp.activo = true
        """

        productos_rows = conn.execute(productos_query, [conjunto_id]).fetchall()

        if not productos_rows:
            raise HTTPException(status_code=400, detail=f"Conjunto {conjunto_id} no tiene productos activos")

        # PASO 2: Calcular demanda total del conjunto (simulada por ahora)
        # TODO: Calcular de ventas_raw reales
        demanda_total_diaria = Decimal('60.0')  # Ejemplo: 60 bultos/día
        demanda_total_periodo = demanda_total_diaria * dias

        # PASO 3: Crear distribución normal (sin considerar disponibilidad)
        distribucion_normal = []
        total_share = sum(row[3] for row in productos_rows)

        for row in productos_rows:
            codigo = row[0]
            descripcion = row[1]
            marca = row[2]
            share_original = Decimal(str(row[3]))
            stock_actual = Decimal(str(row[4]))
            stock_cd = Decimal(str(row[5]))

            # Normalizar share si no suma 100%
            share_normalizado = (share_original / Decimal(str(total_share))) * 100 if total_share > 0 else Decimal('0')

            demanda_original = (demanda_total_periodo * share_normalizado) / 100
            deficit = max(Decimal('0'), demanda_original - stock_actual)

            distribucion_normal.append(ProductoDistribucion(
                codigo_producto=codigo,
                descripcion=descripcion or codigo,
                marca=marca,
                share_original=share_normalizado,
                share_ajustado=share_normalizado,  # Igual por ahora
                demanda_original=demanda_original,
                demanda_ajustada=demanda_original,  # Igual por ahora
                stock_actual=stock_actual,
                stock_cd=stock_cd,
                deficit=deficit
            ))

        # PASO 4: Identificar productos sin stock en CD y redistribuir
        productos_sin_stock = [p for p in distribucion_normal if p.stock_cd == 0]
        productos_con_stock = [p for p in distribucion_normal if p.stock_cd > 0]

        distribucion_redistribuida = []
        alertas = []

        if productos_sin_stock:
            # Hay productos sin stock - REDISTRIBUIR
            # Calcular nuevo total de shares (solo productos disponibles)
            total_share_disponible = sum(p.share_original for p in productos_con_stock)

            if total_share_disponible == 0:
                # TODOS sin stock - problema crítico
                alertas.append(Alerta(
                    tipo="stockout",
                    mensaje=f"CRÍTICO: Todos los productos del conjunto sin stock en CD",
                    severidad="critical",
                    productos_afectados=[p.codigo_producto for p in productos_sin_stock]
                ))

                distribucion_redistribuida = distribucion_normal  # Sin cambios

            else:
                # Redistribuir entre disponibles
                for prod in distribucion_normal:
                    if prod.stock_cd > 0:
                        # Producto disponible - recibe parte de la demanda redistribuida
                        share_ajustado = (prod.share_original / total_share_disponible) * 100
                        demanda_ajustada = (demanda_total_periodo * share_ajustado) / 100
                        motivo = None

                        if share_ajustado > prod.share_original:
                            # Este producto recibe demanda extra
                            productos_sin_stock_str = ", ".join([p.codigo_producto for p in productos_sin_stock])
                            motivo = f"Recibe parte de demanda de {productos_sin_stock_str} (sin stock en CD)"

                        distribucion_redistribuida.append(ProductoDistribucion(
                            codigo_producto=prod.codigo_producto,
                            descripcion=prod.descripcion,
                            marca=prod.marca,
                            share_original=prod.share_original,
                            share_ajustado=share_ajustado,
                            demanda_original=prod.demanda_original,
                            demanda_ajustada=demanda_ajustada,
                            stock_actual=prod.stock_actual,
                            stock_cd=prod.stock_cd,
                            deficit=max(Decimal('0'), demanda_ajustada - prod.stock_actual),
                            motivo_ajuste=motivo
                        ))
                    else:
                        # Producto sin stock - demanda va a cero
                        distribucion_redistribuida.append(ProductoDistribucion(
                            codigo_producto=prod.codigo_producto,
                            descripcion=prod.descripcion,
                            marca=prod.marca,
                            share_original=prod.share_original,
                            share_ajustado=Decimal('0'),
                            demanda_original=prod.demanda_original,
                            demanda_ajustada=Decimal('0'),
                            stock_actual=prod.stock_actual,
                            stock_cd=prod.stock_cd,
                            deficit=Decimal('0'),
                            motivo_ajuste="Sin stock en Centro de Distribución"
                        ))

                # Generar alerta de redistribución
                productos_sin_stock_nombres = [f"{p.codigo_producto}" for p in productos_sin_stock]
                productos_con_stock_nombres = [f"{p.codigo_producto}" for p in productos_con_stock]

                alertas.append(Alerta(
                    tipo="redistribucion",
                    mensaje=f"{len(productos_sin_stock)} producto(s) sin stock en CD - demanda redistribuida entre {len(productos_con_stock)} producto(s) disponible(s)",
                    severidad="warning",
                    productos_afectados=productos_sin_stock_nombres
                ))

        else:
            # Todos con stock - no hay redistribución
            distribucion_redistribuida = distribucion_normal

        # Calcular % redistribuido
        demanda_redistribuida = sum(p.demanda_ajustada - p.demanda_original for p in distribucion_redistribuida if p.demanda_ajustada > p.demanda_original)
        porcentaje_redistribuido = (demanda_redistribuida / demanda_total_periodo * 100) if demanda_total_periodo > 0 else Decimal('0')

        conn.close()

        return PronosticoJerarquicoResponse(
            conjunto_id=conjunto_id,
            nombre=conjunto_nombre,
            ubicacion_id=ubicacion_id,
            dias_pronostico=dias,
            demanda_total_conjunto=demanda_total_periodo,
            distribucion_normal=distribucion_normal,
            distribucion_con_redistribucion=distribucion_redistribuida,
            alertas=alertas,
            productos_sin_stock_cd=len(productos_sin_stock),
            porcentaje_redistribuido=porcentaje_redistribuido
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al generar pronóstico: {str(e)}")


# =====================================================================================
# ENDPOINT - SIMULACIÓN
# =====================================================================================

@router.post("/{conjunto_id}/simular-stockout", response_model=SimulacionStockoutResponse)
async def simular_stockout(conjunto_id: str, simulacion: SimulacionStockout):
    """
    Simular qué pasa si faltan ciertos productos (para testing y análisis).

    Esto es útil para:
    - Entrenar al equipo
    - Planificar escenarios
    - Validar la lógica de redistribución
    """
    # TODO: Implementar simulación
    # Por ahora retornar respuesta básica
    raise HTTPException(status_code=501, detail="Endpoint de simulación en desarrollo")
