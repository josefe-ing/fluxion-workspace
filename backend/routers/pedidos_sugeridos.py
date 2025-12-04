"""
Router para el workflow completo de Pedidos Sugeridos con Devoluciones
Migrado a PostgreSQL - Diciembre 2025

Incluye:
- Calcular pedido sugerido con devoluciones
- Guardar pedido en estado borrador
- Enviar para aprobación de gerente
- Aprobar/rechazar por gerente (con comentarios)
- Finalizar pedido y generar Excel
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional, Any
import uuid
from datetime import datetime, date
from decimal import Decimal
import logging

from models.pedidos_sugeridos import (
    # Request/Response models
    CalcularPedidoRequest,
    CalcularPedidoResponse,
    GuardarPedidoRequest,
    PedidoGuardadoResponse,
    ActualizarEstadoPedidoRequest,
    CrearComentarioRequest,
    # Entity models
    ProductoPedidoSugeridoCalculado,
    ProductoDevolucionSugeridaCalculada,
    PedidoSugeridoCompleto,
    PedidoSugeridoResumen,
    PedidoHistorial,
    PedidoComentario,
    # Enums
    EstadoPedido,
)
from db_manager import get_db_connection, get_db_connection_write

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/pedidos-sugeridos", tags=["Pedidos Sugeridos - Workflow"])


def get_db():
    """Get database connection (read-only para consultas)"""
    with get_db_connection() as conn:
        yield conn


def get_db_write():
    """Get database connection (read-write para escrituras)"""
    with get_db_connection_write() as conn:
        yield conn


# =====================================================================================
# ESTADO CONSTANTES (para compatibilidad con PostgreSQL)
# =====================================================================================

ESTADO_BORRADOR = "borrador"
ESTADO_PENDIENTE_APROBACION_GERENTE = "pendiente_aprobacion_gerente"
ESTADO_APROBADO_GERENTE = "aprobado_gerente"
ESTADO_RECHAZADO_GERENTE = "rechazado_gerente"


# =====================================================================================
# LISTAR PEDIDOS
# =====================================================================================

@router.get("/", response_model=List[PedidoSugeridoResumen])
async def listar_pedidos(
    estado: Optional[str] = None,
    tienda_id: Optional[str] = None,
    conn: Any = Depends(get_db)
):
    """
    Lista pedidos con filtros opcionales

    Filtros:
    - estado: borrador, pendiente_aprobacion_gerente, aprobado_gerente, finalizado
    - tienda_id: filtrar por tienda destino
    """
    try:
        cursor = conn.cursor()

        query = """
            SELECT
                id, numero_pedido, fecha_pedido, fecha_creacion,
                cedi_origen_nombre, tienda_destino_nombre,
                estado, prioridad, tipo_pedido,
                total_productos, total_lineas, total_bultos, total_unidades, total_peso_kg,
                fecha_entrega_solicitada, fecha_aprobacion, fecha_recepcion,
                usuario_creador,
                EXTRACT(DAY FROM (CURRENT_DATE - fecha_creacion::DATE))::INTEGER as dias_desde_creacion
            FROM pedidos_sugeridos
            WHERE 1=1
        """

        params = []
        if estado:
            query += " AND estado = %s"
            params.append(estado)
        if tienda_id:
            query += " AND tienda_destino_id = %s"
            params.append(tienda_id)

        query += " ORDER BY fecha_creacion DESC LIMIT 100"

        cursor.execute(query, params if params else None)
        result = cursor.fetchall()
        cursor.close()

        pedidos = []
        for row in result:
            # Calculate porcentaje_avance
            estado_pedido = row[6]
            if estado_pedido == EstadoPedido.RECIBIDO:
                porcentaje = 100
            elif estado_pedido == EstadoPedido.EN_TRANSITO:
                porcentaje = 80
            elif estado_pedido == EstadoPedido.EN_PREPARACION:
                porcentaje = 60
            elif estado_pedido == EstadoPedido.APROBADO:
                porcentaje = 50
            elif estado_pedido == EstadoPedido.SOLICITADO:
                porcentaje = 30
            elif estado_pedido == ESTADO_BORRADOR:
                porcentaje = 10
            else:
                porcentaje = 0

            pedidos.append(PedidoSugeridoResumen(
                id=row[0],
                numero_pedido=row[1],
                fecha_pedido=row[2],
                fecha_creacion=row[3],
                cedi_origen_nombre=row[4] or "CEDI",
                tienda_destino_nombre=row[5] or "Tienda",
                estado=row[6],
                prioridad=row[7] or "normal",
                tipo_pedido=row[8] or "reposicion",
                total_productos=row[9] or 0,
                total_lineas=row[10] or 0,
                total_bultos=float(row[11]) if row[11] else 0.0,
                total_unidades=float(row[12]) if row[12] else 0.0,
                total_peso_kg=float(row[13]) if row[13] else None,
                fecha_entrega_solicitada=row[14],
                fecha_aprobacion=row[15],
                fecha_recepcion=row[16],
                usuario_creador=row[17] or "sistema",
                dias_desde_creacion=row[18],
                porcentaje_avance=porcentaje
            ))

        return pedidos

    except Exception as e:
        logger.error(f"❌ Error listando pedidos: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error listando pedidos: {str(e)}")


# =====================================================================================
# GUARDAR PEDIDO (estado: borrador)
# =====================================================================================

@router.post("/", response_model=PedidoGuardadoResponse)
async def crear_pedido(
    request: GuardarPedidoRequest,
    conn: Any = Depends(get_db_write)
):
    """
    Alias de /guardar para compatibilidad con frontend
    POST /api/pedidos-sugeridos
    """
    return await guardar_pedido(request, conn)


@router.post("/guardar", response_model=PedidoGuardadoResponse)
async def guardar_pedido(
    request: GuardarPedidoRequest,
    conn: Any = Depends(get_db_write)
):
    """
    Guarda pedido en estado BORRADOR
    """
    try:
        logger.info(f"💾 Guardando pedido: {request.tienda_destino_nombre}")
        cursor = conn.cursor()

        # Generar IDs
        pedido_id = str(uuid.uuid4())

        # Generar número de pedido
        cursor.execute("SELECT MAX(numero_pedido) FROM pedidos_sugeridos WHERE numero_pedido LIKE 'PS-%%'")
        result = cursor.fetchone()
        if result and result[0]:
            ultimo = int(result[0].split('-')[1])
            numero_pedido = f"PS-{ultimo + 1:05d}"
        else:
            numero_pedido = "PS-00001"

        # Filtrar productos incluidos
        productos_incluidos = [p for p in request.productos if p.incluido]
        devoluciones_incluidas = [d for d in request.devoluciones if d.incluido]

        # Calcular totales productos a recibir
        total_productos = len(productos_incluidos)
        total_bultos = sum(Decimal(str(p.cantidad_pedida_bultos)) for p in productos_incluidos)
        total_unidades = sum(Decimal(str(p.total_unidades)) for p in productos_incluidos)

        # Calcular totales devoluciones
        tiene_devoluciones = len(devoluciones_incluidas) > 0
        total_productos_devolucion = len(devoluciones_incluidas)
        total_bultos_devolucion = sum(Decimal(str(d.devolucion_confirmada_bultos)) for d in devoluciones_incluidas)
        total_unidades_devolucion = sum(Decimal(str(d.total_unidades_devolver)) for d in devoluciones_incluidas)

        # Insertar pedido principal
        cursor.execute("""
            INSERT INTO pedidos_sugeridos (
                id, numero_pedido,
                cedi_origen_id, cedi_origen_nombre,
                tienda_destino_id, tienda_destino_nombre,
                fecha_pedido, fecha_entrega_solicitada,
                estado, requiere_aprobacion,
                total_productos, total_bultos, total_unidades,
                tiene_devoluciones, total_productos_devolucion,
                total_bultos_devolucion, total_unidades_devolucion,
                dias_cobertura, tipo_pedido, prioridad,
                observaciones, notas_picking, notas_entrega,
                usuario_creador, fecha_creacion, version
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, 1)
        """, [
            pedido_id, numero_pedido,
            request.cedi_origen_id, request.cedi_origen_nombre,
            request.tienda_destino_id, request.tienda_destino_nombre,
            request.fecha_pedido or date.today(), request.fecha_entrega_solicitada,
            ESTADO_BORRADOR, request.requiere_aprobacion,
            total_productos, float(total_bultos), float(total_unidades),
            tiene_devoluciones, total_productos_devolucion,
            float(total_bultos_devolucion), float(total_unidades_devolucion),
            request.dias_cobertura, request.tipo_pedido, request.prioridad,
            request.observaciones, request.notas_picking, request.notas_entrega,
            "sistema"
        ])

        # Insertar detalle de productos a RECIBIR
        for idx, producto in enumerate(productos_incluidos):
            detalle_id = str(uuid.uuid4())
            cursor.execute("""
                INSERT INTO pedidos_sugeridos_detalle (
                    id, pedido_id, linea_numero,
                    codigo_producto, codigo_barras, descripcion_producto,
                    categoria, grupo, subgrupo, marca, modelo, presentacion,
                    cuadrante_producto, cantidad_bultos,
                    cantidad_sugerida_unidades, cantidad_sugerida_bultos,
                    cantidad_pedida_unidades, cantidad_pedida_bultos,
                    total_unidades,
                    prom_ventas_5dias_unid, prom_ventas_8sem_unid,
                    stock_tienda, stock_cedi_origen,
                    stock_minimo, stock_maximo, punto_reorden,
                    razon_pedido, incluido, observaciones,
                    fecha_creacion
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
            """, [
                detalle_id, pedido_id, idx + 1,
                producto.codigo_producto, producto.codigo_barras, producto.descripcion_producto,
                producto.categoria, producto.grupo, producto.subgrupo,
                producto.marca, producto.modelo, producto.presentacion,
                producto.cuadrante_producto, float(producto.cantidad_bultos),
                float(producto.cantidad_sugerida_unidades), float(producto.cantidad_sugerida_bultos),
                float(producto.cantidad_pedida_unidades), float(producto.cantidad_pedida_bultos),
                float(producto.total_unidades),
                float(producto.prom_ventas_5dias_unid), float(producto.prom_ventas_8sem_unid),
                float(producto.stock_tienda), float(producto.stock_cedi_origen),
                float(producto.stock_minimo), float(producto.stock_maximo), float(producto.punto_reorden),
                producto.razon_pedido, producto.incluido, producto.observaciones
            ])

        # Insertar devoluciones
        for idx, devolucion in enumerate(devoluciones_incluidas):
            devolucion_id = str(uuid.uuid4())
            cursor.execute("""
                INSERT INTO pedidos_sugeridos_devoluciones (
                    id, pedido_id, linea_numero,
                    codigo_producto, codigo_barras, descripcion_producto,
                    categoria, grupo, subgrupo, marca, presentacion,
                    cuadrante_producto, cantidad_bultos,
                    stock_actual_tienda, stock_maximo, stock_optimo,
                    exceso_unidades, exceso_bultos,
                    devolucion_sugerida_unidades, devolucion_sugerida_bultos,
                    devolucion_confirmada_unidades, devolucion_confirmada_bultos,
                    total_unidades_devolver,
                    razon_devolucion, prioridad_devolucion,
                    dias_sin_venta, prom_ventas_30dias, dias_cobertura_actual,
                    incluido, observaciones,
                    fecha_creacion
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
            """, [
                devolucion_id, pedido_id, idx + 1,
                devolucion.codigo_producto, devolucion.codigo_barras, devolucion.descripcion_producto,
                devolucion.categoria, devolucion.grupo, devolucion.subgrupo,
                devolucion.marca, devolucion.presentacion,
                devolucion.cuadrante_producto, float(devolucion.cantidad_bultos),
                float(devolucion.stock_actual_tienda), float(devolucion.stock_maximo),
                float(devolucion.stock_optimo) if devolucion.stock_optimo else None,
                float(devolucion.exceso_unidades), float(devolucion.exceso_bultos),
                float(devolucion.devolucion_sugerida_unidades), float(devolucion.devolucion_sugerida_bultos),
                float(devolucion.devolucion_confirmada_unidades), float(devolucion.devolucion_confirmada_bultos),
                float(devolucion.total_unidades_devolver),
                devolucion.razon_devolucion, devolucion.prioridad_devolucion,
                devolucion.dias_sin_venta,
                float(devolucion.prom_ventas_30dias) if devolucion.prom_ventas_30dias else None,
                float(devolucion.dias_cobertura_actual) if devolucion.dias_cobertura_actual else None,
                devolucion.incluido, devolucion.observaciones
            ])

        # Registrar en historial
        historial_id = str(uuid.uuid4())
        cursor.execute("""
            INSERT INTO pedidos_sugeridos_historial (
                id, pedido_id, estado_anterior, estado_nuevo,
                motivo_cambio, usuario, fecha_cambio
            ) VALUES (%s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
        """, [
            historial_id, pedido_id, None, ESTADO_BORRADOR,
            "Pedido creado", "sistema"
        ])

        conn.commit()
        cursor.close()

        logger.info(f"✅ Pedido {numero_pedido} guardado exitosamente")

        return PedidoGuardadoResponse(
            id=pedido_id,
            numero_pedido=numero_pedido,
            estado=ESTADO_BORRADOR,
            total_productos=total_productos,
            total_bultos=float(total_bultos),
            tiene_devoluciones=tiene_devoluciones,
            total_productos_devolucion=total_productos_devolucion,
            total_bultos_devolucion=float(total_bultos_devolucion),
            fecha_creacion=datetime.now(),
            mensaje=f"Pedido {numero_pedido} guardado exitosamente en estado borrador"
        )

    except Exception as e:
        conn.rollback()
        logger.error(f"❌ Error guardando pedido: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error guardando pedido: {str(e)}")


# =====================================================================================
# OBTENER PEDIDO COMPLETO
# =====================================================================================

@router.get("/{pedido_id}", response_model=PedidoSugeridoCompleto)
async def obtener_pedido(
    pedido_id: str,
    conn: Any = Depends(get_db)
):
    """
    Obtiene pedido completo con todos los productos y devoluciones
    """
    try:
        cursor = conn.cursor()

        # Obtener pedido principal
        cursor.execute("""
            SELECT
                id, numero_pedido, fecha_pedido, fecha_creacion,
                cedi_origen_id, cedi_origen_nombre,
                tienda_destino_id, tienda_destino_nombre,
                estado, prioridad, tipo_pedido,
                total_productos, total_bultos, total_unidades,
                tiene_devoluciones, total_productos_devolucion,
                total_bultos_devolucion, total_unidades_devolucion,
                dias_cobertura, observaciones,
                usuario_creador, fecha_modificacion
            FROM pedidos_sugeridos
            WHERE id = %s
        """, [pedido_id])
        pedido_row = cursor.fetchone()

        if not pedido_row:
            cursor.close()
            raise HTTPException(status_code=404, detail="Pedido no encontrado")

        # Obtener productos del pedido
        cursor.execute("""
            SELECT
                codigo_producto, descripcion_producto,
                cantidad_bultos, cantidad_pedida_bultos, total_unidades,
                cantidad_sugerida_bultos, clasificacion_abc, razon_pedido,
                prom_ventas_8sem_unid, prom_ventas_8sem_bultos,
                stock_tienda, stock_total, incluido
            FROM pedidos_sugeridos_detalle
            WHERE pedido_id = %s
            ORDER BY linea_numero
        """, [pedido_id])
        productos_rows = cursor.fetchall()
        cursor.close()

        # Construir lista de productos
        productos = []
        for idx, prod_row in enumerate(productos_rows):
            cantidad_bultos = float(prod_row[2]) if prod_row[2] else 1.0
            cantidad_pedida_bultos = float(prod_row[3]) if prod_row[3] else 0.0

            productos.append({
                "id": f"{pedido_id}-{idx+1}",
                "pedido_id": pedido_id,
                "linea_numero": idx + 1,
                "codigo_producto": prod_row[0],
                "descripcion_producto": prod_row[1],
                "cantidad_bultos": cantidad_bultos,
                "cantidad_sugerida_bultos": float(prod_row[5]) if prod_row[5] else 0.0,
                "cantidad_sugerida_unidades": (float(prod_row[5]) * cantidad_bultos) if prod_row[5] else 0.0,
                "clasificacion_abc": prod_row[6],
                "razon_pedido": prod_row[7] or "",
                "prom_ventas_8sem_unid": float(prod_row[8]) if prod_row[8] else 0.0,
                "prom_ventas_8sem_bultos": float(prod_row[9]) if prod_row[9] else 0.0,
                "stock_tienda": float(prod_row[10]) if prod_row[10] else 0.0,
                "stock_total": float(prod_row[11]) if prod_row[11] else 0.0,
                "cantidad_pedida_bultos": cantidad_pedida_bultos,
                "cantidad_pedida_unidades": cantidad_pedida_bultos * cantidad_bultos,
                "total_unidades": float(prod_row[4]) if prod_row[4] else 0.0,
                "incluido": prod_row[12] if prod_row[12] is not None else True,
                "fecha_creacion": pedido_row[3],
            })

        # Construir respuesta completa
        return {
            "id": pedido_row[0],
            "numero_pedido": pedido_row[1],
            "fecha_pedido": pedido_row[2],
            "fecha_creacion": pedido_row[3],
            "cedi_origen_nombre": pedido_row[5] or "CEDI",
            "tienda_destino_nombre": pedido_row[7] or "Tienda",
            "estado": pedido_row[8],
            "prioridad": pedido_row[9] or "normal",
            "tipo_pedido": pedido_row[10] or "reposicion",
            "total_productos": pedido_row[11] or 0,
            "total_lineas": len(productos),
            "total_bultos": float(pedido_row[12]) if pedido_row[12] else 0.0,
            "total_unidades": float(pedido_row[13]) if pedido_row[13] else 0.0,
            "total_peso_kg": None,
            "fecha_entrega_solicitada": None,
            "fecha_aprobacion": None,
            "fecha_recepcion": None,
            "usuario_creador": pedido_row[20] or "sistema",
            "dias_desde_creacion": None,
            "porcentaje_avance": None,
            "cedi_origen_id": pedido_row[4],
            "tienda_destino_id": pedido_row[6],
            "numero_guia": None,
            "numero_orden_compra": None,
            "numero_picking": None,
            "sub_estado": None,
            "requiere_aprobacion": pedido_row[8] == ESTADO_PENDIENTE_APROBACION_GERENTE,
            "total_volumen_m3": None,
            "tiene_devoluciones": pedido_row[14] or False,
            "total_productos_devolucion": pedido_row[15] or 0,
            "total_bultos_devolucion": float(pedido_row[16]) if pedido_row[16] else 0.0,
            "total_unidades_devolucion": float(pedido_row[17]) if pedido_row[17] else 0.0,
            "dias_cobertura": pedido_row[18] or 3,
            "requiere_refrigeracion": False,
            "requiere_congelacion": False,
            "paleta_asignada": None,
            "observaciones": pedido_row[19],
            "notas_picking": None,
            "notas_entrega": None,
            "notas_recepcion": None,
            "usuario_aprobador": None,
            "usuario_picker": None,
            "usuario_receptor": None,
            "fecha_modificacion": pedido_row[21],
            "fecha_inicio_picking": None,
            "fecha_fin_picking": None,
            "fecha_despacho": None,
            "fecha_cancelacion": None,
            "fecha_entrega_real": None,
            "version": 1,
            "pedido_padre_id": None,
            "porcentaje_cumplimiento": None,
            "tiempo_preparacion_horas": None,
            "productos": productos,
            "devoluciones": []
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error obteniendo pedido: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error obteniendo pedido: {str(e)}")


# =====================================================================================
# ENVIAR PARA APROBACIÓN DE GERENTE
# =====================================================================================

@router.post("/{pedido_id}/enviar-aprobacion")
async def enviar_para_aprobacion(
    pedido_id: str,
    conn: Any = Depends(get_db_write)
):
    """
    Cambia estado de BORRADOR → PENDIENTE_APROBACION_GERENTE
    """
    try:
        cursor = conn.cursor()

        # Verificar pedido existe y está en estado correcto
        cursor.execute("""
            SELECT id, numero_pedido, estado, tienda_destino_nombre
            FROM pedidos_sugeridos
            WHERE id = %s
        """, [pedido_id])
        pedido = cursor.fetchone()

        if not pedido:
            cursor.close()
            raise HTTPException(status_code=404, detail="Pedido no encontrado")

        if pedido[2] != ESTADO_BORRADOR:
            cursor.close()
            raise HTTPException(
                status_code=400,
                detail=f"Pedido debe estar en estado BORRADOR. Estado actual: {pedido[2]}"
            )

        # Actualizar estado
        cursor.execute("""
            UPDATE pedidos_sugeridos
            SET estado = %s,
                fecha_modificacion = CURRENT_TIMESTAMP
            WHERE id = %s
        """, [ESTADO_PENDIENTE_APROBACION_GERENTE, pedido_id])

        # Registrar en historial
        historial_id = str(uuid.uuid4())
        cursor.execute("""
            INSERT INTO pedidos_sugeridos_historial (
                id, pedido_id, estado_anterior, estado_nuevo,
                motivo_cambio, usuario, fecha_cambio
            ) VALUES (%s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
        """, [
            historial_id, pedido_id,
            ESTADO_BORRADOR,
            ESTADO_PENDIENTE_APROBACION_GERENTE,
            "Enviado para aprobación del gerente",
            "sistema"
        ])

        conn.commit()
        cursor.close()

        logger.info(f"✅ Pedido {pedido[1]} enviado para aprobación")

        return {
            "success": True,
            "message": f"Pedido {pedido[1]} enviado para aprobación del gerente de {pedido[3]}",
            "pedido_id": pedido_id,
            "numero_pedido": pedido[1],
            "estado_nuevo": ESTADO_PENDIENTE_APROBACION_GERENTE
        }

    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        logger.error(f"❌ Error enviando pedido para aprobación: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error enviando pedido: {str(e)}")


# =====================================================================================
# APROBAR PEDIDO (GERENTE)
# =====================================================================================

@router.post("/{pedido_id}/aprobar")
async def aprobar_pedido(
    pedido_id: str,
    comentario_general: Optional[str] = None,
    conn: Any = Depends(get_db_write)
):
    """
    Gerente aprueba el pedido
    """
    try:
        cursor = conn.cursor()

        # Verificar pedido existe y está en estado correcto
        cursor.execute("""
            SELECT id, numero_pedido, estado, tienda_destino_nombre
            FROM pedidos_sugeridos
            WHERE id = %s
        """, [pedido_id])
        pedido = cursor.fetchone()

        if not pedido:
            cursor.close()
            raise HTTPException(status_code=404, detail="Pedido no encontrado")

        if pedido[2] != ESTADO_PENDIENTE_APROBACION_GERENTE:
            cursor.close()
            raise HTTPException(
                status_code=400,
                detail=f"Pedido debe estar en estado PENDIENTE_APROBACION_GERENTE. Estado actual: {pedido[2]}"
            )

        # Actualizar estado
        cursor.execute("""
            UPDATE pedidos_sugeridos
            SET estado = %s,
                usuario_aprobador_gerente = %s,
                fecha_aprobacion_gerente = CURRENT_TIMESTAMP,
                fecha_modificacion = CURRENT_TIMESTAMP
            WHERE id = %s
        """, [ESTADO_APROBADO_GERENTE, "sistema", pedido_id])

        # Registrar en historial
        historial_id = str(uuid.uuid4())
        cursor.execute("""
            INSERT INTO pedidos_sugeridos_historial (
                id, pedido_id, estado_anterior, estado_nuevo,
                motivo_cambio, usuario, fecha_cambio
            ) VALUES (%s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
        """, [
            historial_id, pedido_id,
            ESTADO_PENDIENTE_APROBACION_GERENTE,
            ESTADO_APROBADO_GERENTE,
            comentario_general or "Aprobado por gerente",
            "sistema"
        ])

        conn.commit()
        cursor.close()

        logger.info(f"✅ Pedido {pedido[1]} aprobado por gerente")

        return {
            "success": True,
            "message": f"Pedido {pedido[1]} aprobado exitosamente",
            "pedido_id": pedido_id,
            "numero_pedido": pedido[1],
            "estado_nuevo": ESTADO_APROBADO_GERENTE
        }

    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        logger.error(f"❌ Error aprobando pedido: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error aprobando pedido: {str(e)}")


# =====================================================================================
# RECHAZAR PEDIDO (GERENTE)
# =====================================================================================

@router.post("/{pedido_id}/rechazar")
async def rechazar_pedido(
    pedido_id: str,
    motivo: str,
    conn: Any = Depends(get_db_write)
):
    """
    Gerente rechaza el pedido
    """
    try:
        cursor = conn.cursor()

        # Verificar pedido existe y está en estado correcto
        cursor.execute("""
            SELECT id, numero_pedido, estado, tienda_destino_nombre
            FROM pedidos_sugeridos
            WHERE id = %s
        """, [pedido_id])
        pedido = cursor.fetchone()

        if not pedido:
            cursor.close()
            raise HTTPException(status_code=404, detail="Pedido no encontrado")

        if pedido[2] != ESTADO_PENDIENTE_APROBACION_GERENTE:
            cursor.close()
            raise HTTPException(
                status_code=400,
                detail=f"Pedido debe estar en estado PENDIENTE_APROBACION_GERENTE. Estado actual: {pedido[2]}"
            )

        # Actualizar estado
        cursor.execute("""
            UPDATE pedidos_sugeridos
            SET estado = %s,
                usuario_aprobador_gerente = %s,
                fecha_modificacion = CURRENT_TIMESTAMP
            WHERE id = %s
        """, [ESTADO_RECHAZADO_GERENTE, "sistema", pedido_id])

        # Registrar en historial
        historial_id = str(uuid.uuid4())
        cursor.execute("""
            INSERT INTO pedidos_sugeridos_historial (
                id, pedido_id, estado_anterior, estado_nuevo,
                motivo_cambio, usuario, fecha_cambio
            ) VALUES (%s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
        """, [
            historial_id, pedido_id,
            ESTADO_PENDIENTE_APROBACION_GERENTE,
            ESTADO_RECHAZADO_GERENTE,
            motivo,
            "sistema"
        ])

        conn.commit()
        cursor.close()

        logger.info(f"❌ Pedido {pedido[1]} rechazado por gerente: {motivo}")

        return {
            "success": True,
            "message": f"Pedido {pedido[1]} rechazado",
            "pedido_id": pedido_id,
            "numero_pedido": pedido[1],
            "estado_nuevo": ESTADO_RECHAZADO_GERENTE,
            "motivo": motivo
        }

    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        logger.error(f"❌ Error rechazando pedido: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error rechazando pedido: {str(e)}")


# =====================================================================================
# DEBUG ENDPOINT - Ver schema de tabla
# =====================================================================================

@router.get("/debug/schema")
async def get_table_schema(conn: Any = Depends(get_db)):
    """
    Endpoint temporal para inspeccionar el esquema de la tabla pedidos_sugeridos
    """
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'pedidos_sugeridos'
            ORDER BY ordinal_position
        """)
        columns = cursor.fetchall()
        cursor.close()

        return {
            "table": "pedidos_sugeridos",
            "columns": [{"name": col[0], "type": col[1]} for col in columns]
        }
    except Exception as e:
        return {"error": str(e)}


# =====================================================================================
# CREAR PEDIDO V2.0 (Método Nivel Objetivo ABC-XYZ)
# =====================================================================================

from pydantic import BaseModel

class ProductoPedidoV2(BaseModel):
    """Producto para pedido v2.0 con datos de nivel objetivo"""
    producto_id: str
    cantidad_pedida: float
    cantidad_sugerida: float
    nivel_objetivo: float
    stock_actual: float
    inventario_en_transito: float
    stock_seguridad: float
    demanda_ciclo: float
    matriz_abc_xyz: str
    prioridad: int


class CrearPedidoV2Request(BaseModel):
    """Request para crear pedido v2.0"""
    cedi_origen_id: str
    tienda_destino_id: str
    fecha_pedido: date
    tipo_pedido: str = "sugerido_v2"
    metodo_calculo: str = "NIVEL_OBJETIVO_V2"
    productos: List[ProductoPedidoV2]


@router.post("/crear-v2", response_model=PedidoGuardadoResponse)
async def crear_pedido_v2(
    request: CrearPedidoV2Request,
    conn: Any = Depends(get_db_write)
):
    """
    Crea un pedido sugerido usando el método v2.0 (Nivel Objetivo ABC-XYZ)
    """
    try:
        logger.info(f"🆕 Creando pedido v2.0: Destino={request.tienda_destino_id}")
        cursor = conn.cursor()

        # Generar IDs
        pedido_id = str(uuid.uuid4())

        # Generar número de pedido
        cursor.execute("SELECT MAX(numero_pedido) FROM pedidos_sugeridos WHERE numero_pedido LIKE 'PS-%%'")
        result = cursor.fetchone()
        if result and result[0]:
            ultimo = int(result[0].split('-')[1])
            numero_pedido = f"PS-{ultimo + 1:05d}"
        else:
            numero_pedido = "PS-00001"

        # Obtener nombres de ubicaciones
        cursor.execute("SELECT nombre FROM ubicaciones WHERE id = %s", [request.cedi_origen_id])
        cedi_nombre = cursor.fetchone()
        cursor.execute("SELECT nombre FROM ubicaciones WHERE id = %s", [request.tienda_destino_id])
        tienda_nombre = cursor.fetchone()

        if not cedi_nombre or not tienda_nombre:
            cursor.close()
            raise HTTPException(status_code=404, detail="Ubicación no encontrada")

        # Calcular totales
        total_productos = len(request.productos)
        total_unidades = sum(p.cantidad_pedida for p in request.productos)

        # Insertar pedido principal
        cursor.execute("""
            INSERT INTO pedidos_sugeridos (
                id, numero_pedido,
                cedi_origen_id, cedi_origen_nombre,
                tienda_destino_id, tienda_destino_nombre,
                fecha_pedido,
                estado, requiere_aprobacion,
                total_productos, total_unidades,
                tipo_pedido, prioridad,
                usuario_creador, fecha_creacion,
                version, metodo_calculo
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, 2, %s)
        """, [
            pedido_id, numero_pedido,
            request.cedi_origen_id, cedi_nombre[0],
            request.tienda_destino_id, tienda_nombre[0],
            request.fecha_pedido,
            ESTADO_BORRADOR, False,
            total_productos, float(total_unidades),
            request.tipo_pedido, "normal",
            "sistema",
            request.metodo_calculo
        ])

        # Insertar detalles de productos
        for idx, producto in enumerate(request.productos):
            detalle_id = str(uuid.uuid4())

            # Obtener información adicional del producto
            cursor.execute("""
                SELECT
                    codigo,
                    COALESCE(nombre, descripcion) as descripcion,
                    categoria,
                    marca
                FROM productos
                WHERE codigo = %s
            """, [producto.producto_id])
            prod_info = cursor.fetchone()

            if not prod_info:
                logger.warning(f"Producto {producto.producto_id} no encontrado, saltando...")
                continue

            codigo, descripcion, categoria, marca = prod_info

            cursor.execute("""
                INSERT INTO pedidos_sugeridos_detalle (
                    id, pedido_id, linea_numero,
                    codigo_producto, descripcion_producto,
                    categoria, marca,
                    cuadrante_producto,
                    cantidad_sugerida_unidades,
                    cantidad_pedida_unidades,
                    total_unidades,
                    stock_tienda,
                    stock_minimo,
                    incluido,
                    fecha_creacion
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
            """, [
                detalle_id, pedido_id, idx + 1,
                codigo, descripcion,
                categoria, marca,
                producto.matriz_abc_xyz,
                float(producto.cantidad_sugerida),
                float(producto.cantidad_pedida),
                float(producto.cantidad_pedida),
                float(producto.stock_actual),
                float(producto.nivel_objetivo),
                True
            ])

        conn.commit()
        cursor.close()

        logger.info(f"✅ Pedido v2.0 creado: {numero_pedido} con {total_productos} productos")

        return PedidoGuardadoResponse(
            id=pedido_id,
            numero_pedido=numero_pedido,
            estado=ESTADO_BORRADOR,
            total_productos=total_productos,
            total_bultos=0.0,
            fecha_creacion=datetime.now(),
            mensaje=f"Pedido {numero_pedido} creado exitosamente"
        )

    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        logger.error(f"❌ Error creando pedido v2.0: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error creando pedido: {str(e)}")
