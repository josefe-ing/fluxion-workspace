@app.get("/api/stock", response_model=PaginatedStockResponse, tags=["Inventario"])
async def get_stock(
    ubicacion_id: Optional[str] = None,
    categoria: Optional[str] = None,
    estado: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
    search: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_order: Optional[str] = 'desc'
):
    """
    Obtiene el estado del stock actual con paginación server-side

    PostgreSQL v2.0: usa inventario_actual con JOINs a productos y ubicaciones
    DuckDB legacy: usa inventario_raw

    Args:
        ubicacion_id: Filtrar por ID de ubicación
        categoria: Filtrar por categoría
        estado: Filtrar por estado de stock
        page: Número de página (inicia en 1)
        page_size: Cantidad de items por página (máx 500)
        search: Buscar por código o descripción de producto
        sort_by: Campo por el cual ordenar (stock, peso)
        sort_order: Orden ascendente (asc) o descendente (desc)
    """
    try:
        # Validar parámetros de paginación
        if page < 1:
            raise HTTPException(status_code=400, detail="El número de página debe ser >= 1")
        if page_size < 1 or page_size > 500:
            raise HTTPException(status_code=400, detail="page_size debe estar entre 1 y 500")

        if is_postgres_mode():
            # ===================================================================
            # PostgreSQL v2.0: Query simplificado usando inventario_actual
            # ===================================================================
            count_query = """
                SELECT COUNT(*)
                FROM inventario_actual ia
                INNER JOIN productos p ON ia.producto_id = p.id
                INNER JOIN ubicaciones u ON ia.ubicacion_id = u.id
                WHERE p.activo = true AND u.activo = true
            """

            query = """
                SELECT
                    ia.ubicacion_id,
                    u.nombre as ubicacion_nombre,
                    'tienda' as tipo_ubicacion,
                    ia.producto_id,
                    p.codigo as codigo_producto,
                    p.descripcion as descripcion_producto,
                    p.categoria,
                    p.marca,
                    ia.cantidad as stock_actual,
                    NULL as stock_minimo,
                    NULL as stock_maximo,
                    NULL as punto_reorden,
                    NULL as precio_venta,
                    p.cantidad_bulto as cantidad_bultos,
                    CASE
                        WHEN ia.cantidad = 0 THEN 'sin_stock'
                        WHEN ia.cantidad < 0 THEN 'stock_negativo'
                        ELSE 'normal'
                    END as estado_stock,
                    NULL as dias_cobertura_actual,
                    false as es_producto_estrella,
                    TO_CHAR(ia.fecha_actualizacion, 'YYYY-MM-DD HH24:MI:SS') as fecha_extraccion,
                    p.peso_kg as peso_producto_kg,
                    (ia.cantidad * p.peso_kg) as peso_total_kg
                FROM inventario_actual ia
                INNER JOIN productos p ON ia.producto_id = p.id
                INNER JOIN ubicaciones u ON ia.ubicacion_id = u.id
                WHERE p.activo = true AND u.activo = true
            """

            stats_query = """
                SELECT
                    SUM(CASE WHEN ia.cantidad = 0 THEN 1 ELSE 0 END) as stock_cero,
                    SUM(CASE WHEN ia.cantidad < 0 THEN 1 ELSE 0 END) as stock_negativo
                FROM inventario_actual ia
                INNER JOIN productos p ON ia.producto_id = p.id
                INNER JOIN ubicaciones u ON ia.ubicacion_id = u.id
                WHERE p.activo = true AND u.activo = true
            """

            params = []

            # Aplicar filtros
            if ubicacion_id:
                query += " AND ia.ubicacion_id = %s"
                count_query += " AND ia.ubicacion_id = %s"
                stats_query += " AND ia.ubicacion_id = %s"
                params.append(ubicacion_id)

            if categoria:
                query += " AND p.categoria = %s"
                count_query += " AND p.categoria = %s"
                stats_query += " AND p.categoria = %s"
                params.append(categoria)

            if search:
                search_term = f"%{search}%"
                query += " AND (p.codigo ILIKE %s OR p.descripcion ILIKE %s)"
                count_query += " AND (p.codigo ILIKE %s OR p.descripcion ILIKE %s)"
                stats_query += " AND (p.codigo ILIKE %s OR p.descripcion ILIKE %s)"
                params.extend([search_term, search_term])

            # Ejecutar queries con PostgreSQL
            with get_db_connection() as conn:
                cursor = conn.cursor()

                # Count
                cursor.execute(count_query, tuple(params))
                total_items = cursor.fetchone()[0]

                # Stats
                cursor.execute(stats_query, tuple(params))
                stats_result = cursor.fetchone()
                stock_cero = stats_result[0] if stats_result[0] is not None else 0
                stock_negativo = stats_result[1] if stats_result[1] is not None else 0

                # Paginación
                total_pages = (total_items + page_size - 1) // page_size
                offset = (page - 1) * page_size

                # Ordenamiento
                if sort_by == 'stock':
                    order_direction = 'DESC' if sort_order == 'desc' else 'ASC'
                    query += f" ORDER BY (CASE WHEN p.cantidad_bulto > 0 THEN ia.cantidad / p.cantidad_bulto ELSE ia.cantidad END) {order_direction}, p.descripcion"
                elif sort_by == 'peso':
                    order_direction = 'DESC' if sort_order == 'desc' else 'ASC'
                    query += f" ORDER BY (ia.cantidad * p.peso_kg) {order_direction} NULLS LAST, p.descripcion"
                else:
                    query += " ORDER BY u.nombre, p.categoria, p.descripcion"

                query += f" LIMIT {page_size} OFFSET {offset}"

                cursor.execute(query, tuple(params))
                result = cursor.fetchall()
                cursor.close()

        else:
            # ===================================================================
            # DuckDB legacy: mantener query original con inventario_raw
            # ===================================================================
            count_query = """
                SELECT COUNT(*)
                FROM inventario_raw inv
                WHERE inv.activo = true
            """

            query = """
                SELECT
                    inv.ubicacion_id,
                    inv.ubicacion_nombre,
                    inv.tipo_ubicacion,
                    inv.codigo_producto as producto_id,
                    inv.codigo_producto,
                    inv.descripcion_producto,
                    inv.categoria,
                    inv.marca,
                    inv.cantidad_actual as stock_actual,
                    inv.stock_minimo,
                    inv.stock_maximo,
                    inv.punto_reorden,
                    inv.precio_venta_actual as precio_venta,
                    inv.cantidad_bultos,
                    inv.estado_stock,
                    inv.dias_sin_movimiento as dias_cobertura_actual,
                    false as es_producto_estrella,
                    CAST(inv.fecha_extraccion AS VARCHAR) as fecha_extraccion,
                    inv.peso_producto as peso_producto_kg,
                    (inv.cantidad_actual * inv.peso_producto) as peso_total_kg
                FROM inventario_raw inv
                WHERE inv.activo = true
            """

            stats_query = """
                SELECT
                    SUM(CASE WHEN inv.cantidad_actual = 0 THEN 1 ELSE 0 END) as stock_cero,
                    SUM(CASE WHEN inv.cantidad_actual < 0 THEN 1 ELSE 0 END) as stock_negativo
                FROM inventario_raw inv
                WHERE inv.activo = true
            """

            params = []

            # Aplicar filtros
            if ubicacion_id:
                query += " AND inv.ubicacion_id = ?"
                count_query += " AND inv.ubicacion_id = ?"
                stats_query += " AND inv.ubicacion_id = ?"
                params.append(ubicacion_id)

            if categoria:
                query += " AND inv.categoria = ?"
                count_query += " AND inv.categoria = ?"
                stats_query += " AND inv.categoria = ?"
                params.append(categoria)

            if estado:
                query += " AND inv.estado_stock = ?"
                count_query += " AND inv.estado_stock = ?"
                stats_query += " AND inv.estado_stock = ?"
                params.append(estado)

            if search:
                search_term = f"%{search}%"
                query += " AND (inv.codigo_producto ILIKE ? OR inv.descripcion_producto ILIKE ?)"
                count_query += " AND (inv.codigo_producto ILIKE ? OR inv.descripcion_producto ILIKE ?)"
                stats_query += " AND (inv.codigo_producto ILIKE ? OR inv.descripcion_producto ILIKE ?)"
                params.extend([search_term, search_term])

            # Ejecutar queries con DuckDB
            with get_db_connection() as conn:
                # Count
                total_items = conn.execute(count_query, params).fetchone()[0]

                # Stats
                stats_result = conn.execute(stats_query, params).fetchone()
                stock_cero = stats_result[0] if stats_result[0] is not None else 0
                stock_negativo = stats_result[1] if stats_result[1] is not None else 0

                # Paginación
                total_pages = (total_items + page_size - 1) // page_size
                offset = (page - 1) * page_size

                # Ordenamiento
                if sort_by == 'stock':
                    order_direction = 'DESC' if sort_order == 'desc' else 'ASC'
                    query += f" ORDER BY (CASE WHEN inv.cantidad_bultos > 0 THEN inv.cantidad_actual / inv.cantidad_bultos ELSE inv.cantidad_actual END) {order_direction}, inv.descripcion_producto"
                elif sort_by == 'peso':
                    order_direction = 'DESC' if sort_order == 'desc' else 'ASC'
                    query += f" ORDER BY (inv.cantidad_actual * inv.peso_producto) {order_direction} NULLS LAST, inv.descripcion_producto"
                else:
                    query += " ORDER BY inv.tipo_ubicacion, inv.ubicacion_nombre, inv.categoria, inv.descripcion_producto"

                query += f" LIMIT {page_size} OFFSET {offset}"

                result = conn.execute(query, params).fetchall()

        # Construir respuesta (común para ambos modos)
        stock_data = []
        for row in result:
            stock_data.append(StockResponse(
                ubicacion_id=row[0],
                ubicacion_nombre=row[1],
                ubicacion_tipo=row[2],
                producto_id=row[3],
                codigo_producto=row[4],
                descripcion_producto=row[5],
                categoria=row[6],
                marca=row[7],
                stock_actual=row[8],
                stock_minimo=row[9],
                stock_maximo=row[10],
                punto_reorden=row[11],
                precio_venta=row[12],
                cantidad_bultos=row[13],
                estado_stock=row[14],
                dias_cobertura_actual=row[15],
                es_producto_estrella=row[16],
                fecha_extraccion=row[17],
                peso_producto_kg=row[18],
                peso_total_kg=row[19]
            ))

        # Crear metadata de paginación
        pagination = PaginationMetadata(
            total_items=total_items,
            total_pages=total_pages,
            current_page=page,
            page_size=page_size,
            has_next=page < total_pages,
            has_previous=page > 1,
            stock_cero=stock_cero,
            stock_negativo=stock_negativo
        )

        return PaginatedStockResponse(
            data=stock_data,
            pagination=pagination
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error obteniendo stock: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")
