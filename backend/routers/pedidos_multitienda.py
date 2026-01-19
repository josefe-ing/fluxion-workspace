"""
Router para Pedidos Multi-Tienda con algoritmo DPD+U

Este módulo permite:
- Calcular pedidos para múltiples tiendas desde un CEDI
- Detectar conflictos de stock (escasez)
- Aplicar distribución DPD+U (Demanda + Urgencia)
- Guardar múltiples pedidos en una sola transacción
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from decimal import Decimal
import logging
import math

from models.pedidos_multitienda import (
    CalcularMultiTiendaRequest,
    CalcularMultiTiendaResponse,
    ConflictoProductoResponse,
    AsignacionTiendaResponse,
    ConfigDPDUResponse,
    PedidoTiendaResponse,
    ProductoPedidoSimplificado,
    GuardarMultiTiendaRequest,
    GuardarMultiTiendaResponse,
    PedidoGuardadoInfo,
)
from services.algoritmo_dpdu import (
    ConfigDPDU,
    DatosTiendaProducto,
    calcular_distribucion_dpdu,
    detectar_conflicto,
    to_dict as asignacion_to_dict,
)
from services.calculo_inventario_abc import calcular_inventario_simple
from db_manager import get_db_connection, get_db_connection_write

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/pedidos-multitienda", tags=["Pedidos Multi-Tienda"])

# Timezone de Venezuela (UTC-4)
VENEZUELA_TZ = ZoneInfo("America/Caracas")


def get_db():
    """Get database connection (read-only)"""
    with get_db_connection() as conn:
        yield conn


def get_db_write():
    """Get database connection (read-write)"""
    with get_db_connection_write() as conn:
        yield conn


# =====================================================================================
# FUNCIONES AUXILIARES
# =====================================================================================

async def obtener_config_dpdu(conn) -> ConfigDPDU:
    """Obtiene la configuración DPD+U desde la base de datos."""
    cursor = conn.cursor()
    cursor.execute("""
        SELECT
            COALESCE(dpdu_peso_demanda, 0.60) as peso_demanda,
            COALESCE(dpdu_peso_urgencia, 0.40) as peso_urgencia,
            COALESCE(dpdu_dias_minimo_urgencia, 0.5) as dias_minimo
        FROM config_inventario_global
        LIMIT 1
    """)
    row = cursor.fetchone()
    cursor.close()

    if row:
        return ConfigDPDU(
            peso_demanda=float(row[0]),
            peso_urgencia=float(row[1]),
            dias_minimo_urgencia=float(row[2])
        )

    # Valores por defecto si no existe configuración
    return ConfigDPDU()


async def obtener_productos_tienda(
    conn,
    cedi_origen: str,
    tienda_destino: str,
    dias_cobertura: int = 3
) -> List[Dict]:
    """
    Obtiene TODOS los productos para una tienda, marcando cuáles necesitan reposición.

    LÓGICA:
    - Retorna todos los productos que tienen ventas, stock en tienda o stock en CEDI
    - Marca como 'es_sugerido=True' los que están por debajo del ROP (necesitan reposición)
    - Marca como 'es_sugerido=False' los que están bien abastecidos (para revisión manual)

    Esto permite al usuario:
    - Ver productos sugeridos automáticamente
    - Buscar productos no sugeridos y agregarlos manualmente si lo considera necesario

    Niveles de stock por ABC:
    - SS (Stock Seguridad): A=1.5d, B=2d, C=3d, D=4d
    - ROP (Punto Reorden): A=3d, B=4d, C=6d, D=8d
    - MAX (Stock Máximo): A=5d, B=8d, C=12d, D=15d
    """
    cursor = conn.cursor()

    # Query principal: obtiene productos con ventas, stock, clasificación ABC y estadísticas
    # IMPORTANTE: Aplica los mismos filtros que el wizard de una sola tienda:
    # 1. Solo productos activos (p.activo = true)
    # 2. Excluye productos en productos_excluidos_tienda
    # 3. Solo productos con clasificación ABC válida (A, B, C, D)
    # 4. Calcula sigma_demanda y demanda_maxima para cálculo estadístico de inventario
    query = """
        WITH ventas_diarias AS (
            -- Ventas diarias por producto (base para todos los cálculos)
            SELECT
                producto_id,
                DATE(fecha_venta) as fecha,
                SUM(cantidad_vendida) as cantidad_vendida
            FROM ventas
            WHERE ubicacion_id = %(tienda)s
              AND fecha_venta >= CURRENT_DATE - INTERVAL '30 days'
              AND fecha_venta < CURRENT_DATE
            GROUP BY producto_id, DATE(fecha_venta)
        ),
        ventas_20dias AS (
            SELECT
                producto_id,
                AVG(cantidad_vendida) as prom_20d,
                PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY cantidad_vendida) as p75
            FROM ventas_diarias
            WHERE fecha >= CURRENT_DATE - INTERVAL '20 days'
            GROUP BY producto_id
        ),
        estadisticas_30d AS (
            -- Sigma y demanda máxima para cálculo estadístico (igual que single-store)
            SELECT
                producto_id,
                CASE
                    WHEN COUNT(*) <= 1 THEN 0
                    ELSE COALESCE(STDDEV(cantidad_vendida), 0)
                END as sigma_demanda,
                COALESCE(MAX(cantidad_vendida), 0) as demanda_maxima
            FROM ventas_diarias
            GROUP BY producto_id
        ),
        stock_tienda AS (
            SELECT producto_id, SUM(cantidad) as stock
            FROM inventario_actual
            WHERE ubicacion_id = %(tienda)s
            GROUP BY producto_id
        ),
        stock_cedi AS (
            SELECT producto_id, SUM(cantidad) as stock
            FROM inventario_actual
            WHERE ubicacion_id = %(cedi)s
            GROUP BY producto_id
        ),
        abc_tienda AS (
            SELECT producto_id, clase_abc, venta_30d
            FROM productos_abc_tienda
            WHERE ubicacion_id = %(tienda)s
        ),
        productos_excluidos AS (
            SELECT producto_id
            FROM productos_excluidos_tienda
            WHERE tienda_id = %(tienda)s AND activo = TRUE
        )
        SELECT
            p.id as producto_id,
            p.codigo,
            p.descripcion,
            p.categoria,
            COALESCE(p.unidades_por_bulto, 1) as unidades_por_bulto,
            COALESCE(v.prom_20d, 0) as prom_20d,
            COALESCE(v.p75, 0) as p75,
            COALESCE(st.stock, 0) as stock_tienda,
            COALESCE(sc.stock, 0) as stock_cedi,
            COALESCE(abc.clase_abc, 'D') as clase_abc,
            COALESCE(abc.venta_30d, 0) as venta_30d,
            COALESCE(est.sigma_demanda, 0) as sigma_demanda,
            COALESCE(est.demanda_maxima, v.p75 * 2, 0) as demanda_maxima
        FROM productos p
        LEFT JOIN ventas_20dias v ON p.id = v.producto_id
        LEFT JOIN estadisticas_30d est ON p.id = est.producto_id
        LEFT JOIN stock_tienda st ON p.id = st.producto_id
        LEFT JOIN stock_cedi sc ON p.id = sc.producto_id
        LEFT JOIN abc_tienda abc ON p.id = abc.producto_id
        LEFT JOIN productos_excluidos pe ON p.id = pe.producto_id
        WHERE p.activo = true
          AND pe.producto_id IS NULL
          AND abc.clase_abc IN ('A', 'B', 'C', 'D')
          AND (COALESCE(v.p75, 0) > 0 OR COALESCE(st.stock, 0) > 0 OR COALESCE(sc.stock, 0) > 0)
        ORDER BY COALESCE(abc.venta_30d, 0) DESC
    """

    cursor.execute(query, {'tienda': tienda_destino, 'cedi': cedi_origen})
    rows = cursor.fetchall()
    cursor.close()

    productos = []
    for row in rows:
        producto_id = row[0]
        codigo = row[1]
        descripcion = row[2]
        categoria = row[3]
        unidades_por_bulto = int(row[4]) or 1
        prom_20d = float(row[5])
        p75 = float(row[6])
        stock_tienda = float(row[7])
        stock_cedi = float(row[8])
        clase_abc = row[9]
        venta_30d = float(row[10])
        sigma_demanda = float(row[11])
        demanda_maxima = float(row[12])

        # Usar el mismo cálculo estadístico que single-store (calcular_inventario_simple)
        # Esto garantiza que ambos wizards usen la misma lógica de ROP, SS y MAX
        resultado = calcular_inventario_simple(
            demanda_p75=p75,
            sigma_demanda=sigma_demanda,
            demanda_maxima=demanda_maxima if demanda_maxima > 0 else p75 * 2,
            unidades_por_bulto=unidades_por_bulto,
            stock_actual=stock_tienda,
            stock_cedi=stock_cedi,
            clase_abc=clase_abc,
            es_generador_trafico=False
        )

        # Extraer valores del resultado estadístico
        punto_reorden = resultado.punto_reorden_unid
        stock_maximo = resultado.stock_maximo_unid
        stock_seguridad = resultado.stock_seguridad_unid
        cantidad_sugerida_unid = resultado.cantidad_sugerida_unid
        cantidad_sugerida_bultos = resultado.cantidad_sugerida_bultos
        tiene_sobrestock = resultado.tiene_sobrestock

        # Calcular días de stock actual (evitar división por cero)
        if p75 > 0:
            dias_stock = stock_tienda / p75
        else:
            dias_stock = 999 if stock_tienda > 0 else 0

        # Determinar si necesita reposición usando el cálculo estadístico
        # Similar a single-store: sugiere si hay cantidad > 0 y hay stock en CEDI
        necesita_reposicion = (
            cantidad_sugerida_bultos > 0 and
            stock_cedi > 0 and
            not tiene_sobrestock
        )

        # Si no necesita reposición, forzar cantidades a 0
        if not necesita_reposicion:
            cantidad_sugerida_unid = 0
            cantidad_sugerida_bultos = 0

        # Incluir TODOS los productos (sugeridos y no sugeridos)
        productos.append({
            'producto_id': producto_id,
            'codigo_producto': codigo,
            'descripcion_producto': descripcion,
            'categoria': categoria,
            'clasificacion_abc': clase_abc,
            'unidades_por_bulto': unidades_por_bulto,
            'prom_p75_unid': p75,
            'prom_20dias_unid': prom_20d,
            'stock_tienda': stock_tienda,
            'stock_cedi_origen': stock_cedi,
            'dias_stock': round(dias_stock, 2),
            'stock_seguridad': stock_seguridad,
            'punto_reorden': punto_reorden,
            'stock_maximo': stock_maximo,
            'cantidad_necesaria_unid': cantidad_sugerida_unid,
            'cantidad_sugerida_bultos': int(cantidad_sugerida_bultos),
            'cantidad_sugerida_unid': cantidad_sugerida_unid,
            'es_sugerido': necesita_reposicion,
        })

    return productos


# =====================================================================================
# ENDPOINT: CALCULAR PEDIDOS MULTI-TIENDA
# =====================================================================================

@router.post("/calcular", response_model=CalcularMultiTiendaResponse)
async def calcular_pedidos_multitienda(
    request: CalcularMultiTiendaRequest,
    conn: Any = Depends(get_db)
):
    """
    Calcula pedidos para múltiples tiendas desde un CEDI.

    1. Calcula el pedido sugerido para cada tienda
    2. Detecta productos con conflicto (stock CEDI < suma de necesidades)
    3. Aplica algoritmo DPD+U para distribuir stock limitado
    4. Retorna pedidos ajustados y lista de conflictos

    El paso 2 (resolución de conflictos) en el frontend solo aparece si:
    - Hay más de 1 tienda seleccionada
    - Existen conflictos de stock
    """
    try:
        # Obtener nombre del CEDI
        cursor = conn.cursor()
        cursor.execute("SELECT nombre FROM ubicaciones WHERE id = %s", (request.cedi_origen,))
        cedi_row = cursor.fetchone()
        cedi_nombre = cedi_row[0] if cedi_row else request.cedi_origen
        cursor.close()

        # Obtener configuración DPD+U
        config_dpdu = await obtener_config_dpdu(conn)

        # Calcular productos para cada tienda
        productos_por_tienda: Dict[str, List[Dict]] = {}
        for tienda in request.tiendas_destino:
            productos = await obtener_productos_tienda(
                conn,
                request.cedi_origen,
                tienda.tienda_id,
                request.dias_cobertura
            )
            productos_por_tienda[tienda.tienda_id] = productos

        # Consolidar todos los productos únicos
        todos_productos: Dict[str, Dict] = {}
        for tienda_id, productos in productos_por_tienda.items():
            for prod in productos:
                codigo = prod['codigo_producto']
                if codigo not in todos_productos:
                    todos_productos[codigo] = {
                        'codigo_producto': codigo,
                        'descripcion_producto': prod['descripcion_producto'],
                        'categoria': prod['categoria'],
                        'clasificacion_abc': prod['clasificacion_abc'],
                        'unidades_por_bulto': prod['unidades_por_bulto'],
                        'stock_cedi': prod['stock_cedi_origen'],
                        'tiendas': {}
                    }
                todos_productos[codigo]['tiendas'][tienda_id] = {
                    'tienda_nombre': next(
                        (t.tienda_nombre for t in request.tiendas_destino if t.tienda_id == tienda_id),
                        tienda_id
                    ),
                    'demanda_p75': prod['prom_p75_unid'],
                    'stock_tienda': prod['stock_tienda'],
                    'dias_stock': prod['dias_stock'],
                    'cantidad_necesaria': prod['cantidad_necesaria_unid'],
                    'cantidad_sugerida_bultos': prod['cantidad_sugerida_bultos'],
                }

        # Detectar conflictos y aplicar DPD+U
        conflictos = []
        productos_sin_conflicto = 0

        for codigo, prod_data in todos_productos.items():
            stock_cedi = prod_data['stock_cedi']
            tiendas_data = prod_data['tiendas']

            # Solo hay conflicto si más de 1 tienda necesita el producto
            if len(tiendas_data) <= 1:
                productos_sin_conflicto += 1
                continue

            # Calcular necesidad total
            necesidad_total = sum(t['cantidad_necesaria'] for t in tiendas_data.values())

            # ¿Es conflicto?
            es_conflicto = stock_cedi < necesidad_total

            if es_conflicto and len(request.tiendas_destino) > 1:
                # Preparar datos para DPD+U
                datos_tiendas = [
                    DatosTiendaProducto(
                        tienda_id=tid,
                        tienda_nombre=tdata['tienda_nombre'],
                        demanda_p75=tdata['demanda_p75'],
                        stock_actual=tdata['stock_tienda'],
                        dias_stock=tdata['dias_stock'],
                        cantidad_necesaria=tdata['cantidad_necesaria']
                    )
                    for tid, tdata in tiendas_data.items()
                ]

                # Aplicar DPD+U
                asignaciones = calcular_distribucion_dpdu(
                    stock_cedi=stock_cedi,
                    unidades_por_bulto=prod_data['unidades_por_bulto'],
                    datos_tiendas=datos_tiendas,
                    config=config_dpdu
                )

                conflictos.append(ConflictoProductoResponse(
                    codigo_producto=codigo,
                    descripcion_producto=prod_data['descripcion_producto'],
                    categoria=prod_data['categoria'],
                    clasificacion_abc=prod_data['clasificacion_abc'],
                    unidades_por_bulto=prod_data['unidades_por_bulto'],
                    stock_cedi_disponible=stock_cedi,
                    stock_cedi_bultos=math.floor(stock_cedi / prod_data['unidades_por_bulto']),
                    demanda_total_tiendas=sum(d.demanda_p75 for d in datos_tiendas),
                    necesidad_total_tiendas=necesidad_total,
                    es_conflicto=True,
                    distribucion_dpdu=[
                        AsignacionTiendaResponse(
                            tienda_id=a.tienda_id,
                            tienda_nombre=a.tienda_nombre,
                            demanda_p75=a.demanda_p75,
                            stock_actual=a.stock_actual,
                            dias_stock=a.dias_stock,
                            cantidad_necesaria=a.cantidad_necesaria,
                            urgencia=a.urgencia,
                            pct_demanda=a.pct_demanda,
                            pct_urgencia=a.pct_urgencia,
                            peso_final=a.peso_final,
                            cantidad_asignada_unid=a.cantidad_asignada_unid,
                            cantidad_asignada_bultos=a.cantidad_asignada_bultos,
                            deficit_vs_necesidad=a.deficit_vs_necesidad,
                            cobertura_dias_resultante=a.cobertura_dias_resultante
                        )
                        for a in asignaciones
                    ]
                ))
            else:
                productos_sin_conflicto += 1

        # Construir pedidos por tienda con cantidades ajustadas
        pedidos_por_tienda = []
        for tienda in request.tiendas_destino:
            productos_tienda = productos_por_tienda.get(tienda.tienda_id, [])

            # Ajustar cantidades según DPD+U
            productos_ajustados = []
            productos_ajustados_count = 0

            for prod in productos_tienda:
                codigo = prod['codigo_producto']
                cantidad_original = prod['cantidad_sugerida_bultos']
                cantidad_final = cantidad_original
                ajustado = False

                # Buscar si este producto tiene conflicto
                conflicto = next((c for c in conflictos if c.codigo_producto == codigo), None)
                if conflicto:
                    # Buscar asignación para esta tienda
                    asignacion = next(
                        (a for a in conflicto.distribucion_dpdu if a.tienda_id == tienda.tienda_id),
                        None
                    )
                    if asignacion:
                        cantidad_final = asignacion.cantidad_asignada_bultos
                        ajustado = cantidad_final != cantidad_original
                        if ajustado:
                            productos_ajustados_count += 1

                productos_ajustados.append(ProductoPedidoSimplificado(
                    codigo_producto=codigo,
                    descripcion_producto=prod['descripcion_producto'],
                    categoria=prod['categoria'],
                    clasificacion_abc=prod['clasificacion_abc'],
                    unidades_por_bulto=prod['unidades_por_bulto'],
                    cantidad_sugerida_unid=cantidad_final * prod['unidades_por_bulto'],
                    cantidad_sugerida_bultos=cantidad_final,
                    stock_tienda=prod['stock_tienda'],
                    stock_cedi_origen=prod['stock_cedi_origen'],
                    prom_p75_unid=prod['prom_p75_unid'],
                    dias_stock=prod['dias_stock'],
                    ajustado_por_dpdu=ajustado,
                    cantidad_original_bultos=cantidad_original if ajustado else None,
                    es_sugerido=prod.get('es_sugerido', True)
                ))

            # Calcular totales solo de productos sugeridos (los que irán en el pedido)
            productos_sugeridos = [p for p in productos_ajustados if p.es_sugerido]
            pedidos_por_tienda.append(PedidoTiendaResponse(
                tienda_id=tienda.tienda_id,
                tienda_nombre=tienda.tienda_nombre,
                productos=productos_ajustados,
                total_productos=len(productos_sugeridos),
                total_bultos=sum(p.cantidad_sugerida_bultos for p in productos_sugeridos),
                total_unidades=sum(p.cantidad_sugerida_unid for p in productos_sugeridos),
                productos_ajustados_dpdu=productos_ajustados_count
            ))

        # Ordenar conflictos por stock_cedi (menor primero = más crítico)
        conflictos.sort(key=lambda c: c.stock_cedi_disponible)

        return CalcularMultiTiendaResponse(
            cedi_origen=request.cedi_origen,
            cedi_origen_nombre=cedi_nombre,
            fecha_calculo=datetime.now(VENEZUELA_TZ),
            dias_cobertura=request.dias_cobertura,
            config_dpdu=ConfigDPDUResponse(
                peso_demanda=config_dpdu.peso_demanda,
                peso_urgencia=config_dpdu.peso_urgencia,
                dias_minimo_urgencia=config_dpdu.dias_minimo_urgencia
            ),
            conflictos=conflictos,
            total_conflictos=len(conflictos),
            productos_sin_conflicto=productos_sin_conflicto,
            pedidos_por_tienda=pedidos_por_tienda,
            resumen={
                'total_tiendas': len(request.tiendas_destino),
                'total_productos_unicos': len(todos_productos),
                'total_conflictos': len(conflictos),
                'total_bultos': sum(p.total_bultos for p in pedidos_por_tienda),
            }
        )

    except Exception as e:
        logger.error(f"Error calculando pedidos multi-tienda: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")


# =====================================================================================
# ENDPOINT: GUARDAR PEDIDOS EN LOTE
# =====================================================================================

@router.post("/guardar-lote", response_model=GuardarMultiTiendaResponse)
async def guardar_pedidos_lote(
    request: GuardarMultiTiendaRequest,
    conn: Any = Depends(get_db_write)
):
    """
    Guarda múltiples pedidos en una sola transacción.

    - Genera un grupo_pedido_id para agrupar los pedidos
    - Números de pedido correlacionados: PS-XXXXX-1, PS-XXXXX-2, etc.
    - Rollback automático si falla alguno
    """
    try:
        cursor = conn.cursor()

        # Generar ID de grupo
        grupo_id = f"GRUPO-{uuid.uuid4().hex[:8].upper()}"

        # Obtener siguiente número base de pedido
        cursor.execute("SELECT MAX(numero_pedido) FROM pedidos_sugeridos WHERE numero_pedido LIKE 'PS-%'")
        ultimo = cursor.fetchone()[0]
        if ultimo:
            try:
                # Extraer número base (puede ser PS-00001 o PS-00001-1)
                partes = ultimo.replace('PS-', '').split('-')
                num_base = int(partes[0]) + 1
            except:
                num_base = 1
        else:
            num_base = 1

        fecha_pedido = request.fecha_pedido or datetime.now(VENEZUELA_TZ).strftime('%Y-%m-%d')
        pedidos_creados = []

        for idx, pedido in enumerate(request.pedidos, 1):
            pedido_id = f"ped_{uuid.uuid4().hex[:12]}"
            numero_pedido = f"PS-{num_base:05d}-{idx}"

            # Filtrar solo productos incluidos
            productos_incluidos = [p for p in pedido.productos if p.incluido]

            if not productos_incluidos:
                continue

            total_productos = len(productos_incluidos)
            total_bultos = sum(p.cantidad_pedida_bultos for p in productos_incluidos)
            total_unidades = sum(p.cantidad_pedida_unidades for p in productos_incluidos)

            # Insertar pedido
            cursor.execute("""
                INSERT INTO pedidos_sugeridos (
                    id, numero_pedido, version,
                    cedi_origen_id, cedi_origen_nombre,
                    tienda_destino_id, tienda_destino_nombre,
                    fecha_pedido, fecha_creacion,
                    estado, tipo_pedido, prioridad,
                    dias_cobertura,
                    total_productos, total_lineas, total_bultos, total_unidades,
                    grupo_pedido_id, orden_en_grupo,
                    usuario_creador
                ) VALUES (
                    %s, %s, 1,
                    %s, %s,
                    %s, %s,
                    %s, CURRENT_TIMESTAMP,
                    'borrador', %s, %s,
                    %s,
                    %s, %s, %s, %s,
                    %s, %s,
                    %s
                )
            """, (
                pedido_id, numero_pedido,
                request.cedi_origen_id, request.cedi_origen_nombre,
                pedido.tienda_destino_id, pedido.tienda_destino_nombre,
                fecha_pedido,
                request.tipo_pedido, request.prioridad,
                request.dias_cobertura,
                total_productos, total_productos, total_bultos, total_unidades,
                grupo_id, idx,
                request.usuario_creador
            ))

            # Insertar detalle de productos
            for linea_num, prod in enumerate(productos_incluidos, start=1):
                cursor.execute("""
                    INSERT INTO pedidos_sugeridos_detalle (
                        pedido_id, linea_numero, codigo_producto, descripcion_producto,
                        categoria, clasificacion_abc,
                        cantidad_bultos, cantidad_sugerida_bultos,
                        cantidad_pedida_bultos, cantidad_pedida_unidades, total_unidades,
                        stock_tienda, stock_cedi_origen,
                        prom_ventas_5dias_unid, prom_ventas_20dias_unid,
                        prom_p75_unid,
                        stock_minimo, stock_maximo, punto_reorden,
                        razon_pedido
                    ) VALUES (
                        %s, %s, %s, %s,
                        %s, %s,
                        %s, %s,
                        %s, %s, %s,
                        %s, %s,
                        %s, %s,
                        %s,
                        %s, %s, %s,
                        %s
                    )
                """, (
                    pedido_id, linea_num, prod.codigo_producto, prod.descripcion_producto,
                    prod.categoria, prod.clasificacion_abc,
                    prod.unidades_por_bulto, prod.cantidad_pedida_bultos,
                    prod.cantidad_pedida_bultos, prod.cantidad_pedida_unidades, prod.cantidad_pedida_unidades,
                    prod.stock_tienda, prod.stock_cedi_origen,
                    prod.prom_ventas_5dias_unid, prod.prom_ventas_20dias_unid,
                    prod.prom_p75_unid,
                    prod.stock_minimo, prod.stock_maximo, prod.punto_reorden,
                    prod.razon_ajuste_dpdu if prod.ajustado_por_dpdu else None
                ))

            # Insertar en historial
            cursor.execute("""
                INSERT INTO pedidos_sugeridos_historial (
                    pedido_id, estado_anterior, estado_nuevo, motivo_cambio
                ) VALUES (%s, NULL, 'borrador', 'Pedido creado (multi-tienda)')
            """, (pedido_id,))

            pedidos_creados.append(PedidoGuardadoInfo(
                pedido_id=pedido_id,
                numero_pedido=numero_pedido,
                tienda_id=pedido.tienda_destino_id,
                tienda_nombre=pedido.tienda_destino_nombre,
                total_productos=total_productos,
                total_bultos=int(total_bultos),
                estado='borrador'
            ))

        conn.commit()
        cursor.close()

        return GuardarMultiTiendaResponse(
            success=True,
            grupo_pedido_id=grupo_id,
            pedidos_creados=pedidos_creados,
            total_pedidos=len(pedidos_creados),
            mensaje=f"Se crearon {len(pedidos_creados)} pedidos exitosamente"
        )

    except Exception as e:
        conn.rollback()
        logger.error(f"Error guardando pedidos multi-tienda: {str(e)}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")


# =====================================================================================
# ENDPOINT: OBTENER CONFIGURACIÓN DPD+U
# =====================================================================================

@router.get("/config-dpdu", response_model=ConfigDPDUResponse)
async def get_config_dpdu(conn: Any = Depends(get_db)):
    """Obtiene la configuración actual del algoritmo DPD+U."""
    try:
        config = await obtener_config_dpdu(conn)
        return ConfigDPDUResponse(
            peso_demanda=config.peso_demanda,
            peso_urgencia=config.peso_urgencia,
            dias_minimo_urgencia=config.dias_minimo_urgencia
        )
    except Exception as e:
        logger.error(f"Error obteniendo config DPD+U: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")
