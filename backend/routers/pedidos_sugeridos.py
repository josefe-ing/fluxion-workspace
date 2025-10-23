"""
Router para el workflow completo de Pedidos Sugeridos con Devoluciones
Incluye:
- Calcular pedido sugerido con devoluciones
- Guardar pedido en estado borrador
- Enviar para aprobación de gerente
- Aprobar/rechazar por gerente (con comentarios)
- Finalizar pedido y generar Excel
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
import duckdb
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
from services.calcular_devoluciones import (
    calcular_devoluciones_sugeridas,
    aplicar_reglas_exclusion
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/pedidos-sugeridos", tags=["Pedidos Sugeridos - Workflow"])

# TODO: Replace with actual DB connection dependency
DB_PATH = "data/fluxion_production.db"


def get_db():
    """Get database connection"""
    conn = duckdb.connect(str(DB_PATH), read_only=False)
    try:
        yield conn
    finally:
        conn.close()


# =====================================================================================
# CALCULAR PEDIDO SUGERIDO CON DEVOLUCIONES
# =====================================================================================

@router.post("/calcular", response_model=CalcularPedidoResponse)
async def calcular_pedido_con_devoluciones(
    request: CalcularPedidoRequest,
    conn: duckdb.DuckDBPyConnection = Depends(get_db)
):
    """
    Calcula pedido sugerido con productos a recibir Y devoluciones sugeridas

    Pasos:
    1. Calcula productos a pedir (basado en ventas, stock, forecast)
    2. Si incluir_devoluciones=True, calcula productos a devolver (exceso de stock)
    3. Retorna ambas listas con totales

    **Este endpoint NO guarda nada en DB, solo calcula y retorna**
    """
    try:
        logger.info(f"📊 Calculando pedido: {request.tienda_destino_nombre} (incluir_devoluciones={request.incluir_devoluciones})")

        # ===== PASO 1: CALCULAR PRODUCTOS A RECIBIR =====
        # TODO: Implement product calculation logic
        # For now, returning empty list as placeholder
        productos_recibir = []

        # ===== PASO 2: CALCULAR DEVOLUCIONES SI ESTÁ HABILITADO =====
        productos_devolver = []
        if request.incluir_devoluciones:
            logger.info("🔄 Calculando devoluciones sugeridas...")
            devoluciones_raw = calcular_devoluciones_sugeridas(
                conn=conn,
                tienda_id=request.tienda_destino_id,
                cedi_origen_id=request.cedi_origen_id,
                umbral_minimo_bultos=1.0
            )

            # Aplicar reglas de exclusión si es necesario
            devoluciones_filtradas = aplicar_reglas_exclusion(
                devoluciones=devoluciones_raw,
                productos_excluir=[],  # TODO: Get from config
                categorias_excluir=[]  # TODO: Get from config
            )

            # Convertir a Pydantic models
            for dev in devoluciones_filtradas:
                productos_devolver.append(ProductoDevolucionSugeridaCalculada(**dev))

        # ===== PASO 3: CALCULAR TOTALES =====
        total_productos_recibir = len(productos_recibir)
        total_bultos_recibir = sum(p.cantidad_sugerida_bultos for p in productos_recibir)
        total_unidades_recibir = sum(p.cantidad_sugerida_unidades for p in productos_recibir)

        total_productos_devolver = len(productos_devolver)
        total_bultos_devolver = sum(p.devolucion_sugerida_bultos for p in productos_devolver)
        total_unidades_devolver = sum(p.devolucion_sugerida_unidades for p in productos_devolver)

        logger.info(f"✅ Calculado: {total_productos_recibir} productos a recibir, {total_productos_devolver} a devolver")

        return CalcularPedidoResponse(
            productos_recibir=productos_recibir,
            productos_devolver=productos_devolver,
            total_productos_recibir=total_productos_recibir,
            total_bultos_recibir=total_bultos_recibir,
            total_unidades_recibir=total_unidades_recibir,
            total_productos_devolver=total_productos_devolver,
            total_bultos_devolver=total_bultos_devolver,
            total_unidades_devolver=total_unidades_devolver,
            cedi_origen_id=request.cedi_origen_id,
            cedi_origen_nombre=request.cedi_origen_nombre,
            tienda_destino_id=request.tienda_destino_id,
            tienda_destino_nombre=request.tienda_destino_nombre,
            dias_cobertura=request.dias_cobertura
        )

    except Exception as e:
        logger.error(f"❌ Error calculando pedido: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error calculando pedido: {str(e)}")


# =====================================================================================
# GUARDAR PEDIDO (estado: borrador)
# =====================================================================================

@router.post("/guardar", response_model=PedidoGuardadoResponse)
async def guardar_pedido(
    request: GuardarPedidoRequest,
    conn: duckdb.DuckDBPyConnection = Depends(get_db)
):
    """
    Guarda pedido en estado BORRADOR

    El analista puede:
    - Ajustar cantidades sugeridas
    - Excluir productos
    - Agregar observaciones
    - Decidir si incluir o no devoluciones

    **Estado inicial**: borrador
    """
    try:
        logger.info(f"💾 Guardando pedido: {request.tienda_destino_nombre}")

        # Generar IDs
        pedido_id = str(uuid.uuid4())

        # Generar número de pedido
        result = conn.execute("SELECT MAX(numero_pedido) FROM pedidos_sugeridos WHERE numero_pedido LIKE 'PS-%'").fetchone()
        if result[0]:
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
        conn.execute("""
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
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 1)
        """, [
            pedido_id, numero_pedido,
            request.cedi_origen_id, request.cedi_origen_nombre,
            request.tienda_destino_id, request.tienda_destino_nombre,
            request.fecha_pedido or date.today(), request.fecha_entrega_solicitada,
            EstadoPedido.BORRADOR, request.requiere_aprobacion,
            total_productos, float(total_bultos), float(total_unidades),
            tiene_devoluciones, total_productos_devolucion,
            float(total_bultos_devolucion), float(total_unidades_devolucion),
            request.dias_cobertura, request.tipo_pedido, request.prioridad,
            request.observaciones, request.notas_picking, request.notas_entrega,
            "sistema"  # TODO: Get real user from auth
        ])

        # Insertar detalle de productos a RECIBIR
        for idx, producto in enumerate(productos_incluidos):
            detalle_id = str(uuid.uuid4())
            conn.execute("""
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
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
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
            conn.execute("""
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
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            """, [
                devolucion_id, pedido_id, idx + 1,
                devolucion.codigo_producto, devolucion.codigo_barras, devolucion.descripcion_producto,
                devolucion.categoria, devolucion.grupo, devolucion.subgrupo,
                devolucion.marca, devolucion.presentacion,
                devolucion.cuadrante_producto, float(devolucion.cantidad_bultos),
                float(devolucion.stock_actual_tienda), float(devolucion.stock_maximo), float(devolucion.stock_optimo) if devolucion.stock_optimo else None,
                float(devolucion.exceso_unidades), float(devolucion.exceso_bultos),
                float(devolucion.devolucion_sugerida_unidades), float(devolucion.devolucion_sugerida_bultos),
                float(devolucion.devolucion_confirmada_unidades), float(devolucion.devolucion_confirmada_bultos),
                float(devolucion.total_unidades_devolver),
                devolucion.razon_devolucion, devolucion.prioridad_devolucion,
                devolucion.dias_sin_venta, float(devolucion.prom_ventas_30dias) if devolucion.prom_ventas_30dias else None,
                float(devolucion.dias_cobertura_actual) if devolucion.dias_cobertura_actual else None,
                devolucion.incluido, devolucion.observaciones
            ])

        # Registrar en historial
        historial_id = str(uuid.uuid4())
        conn.execute("""
            INSERT INTO pedidos_sugeridos_historial (
                id, pedido_id, estado_anterior, estado_nuevo,
                motivo_cambio, usuario, fecha_cambio
            ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, [
            historial_id, pedido_id, None, EstadoPedido.BORRADOR,
            "Pedido creado", "sistema"
        ])

        logger.info(f"✅ Pedido {numero_pedido} guardado exitosamente")

        return PedidoGuardadoResponse(
            id=pedido_id,
            numero_pedido=numero_pedido,
            estado=EstadoPedido.BORRADOR,
            total_productos=total_productos,
            total_bultos=float(total_bultos),
            tiene_devoluciones=tiene_devoluciones,
            total_productos_devolucion=total_productos_devolucion,
            total_bultos_devolucion=float(total_bultos_devolucion),
            fecha_creacion=datetime.now(),
            mensaje=f"Pedido {numero_pedido} guardado exitosamente en estado borrador"
        )

    except Exception as e:
        logger.error(f"❌ Error guardando pedido: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error guardando pedido: {str(e)}")


# =====================================================================================
# ENVIAR PARA APROBACIÓN DE GERENTE
# =====================================================================================

@router.post("/{pedido_id}/enviar-aprobacion")
async def enviar_para_aprobacion(
    pedido_id: str,
    conn: duckdb.DuckDBPyConnection = Depends(get_db)
):
    """
    Cambia estado de BORRADOR → PENDIENTE_APROBACION_GERENTE

    Acciones:
    1. Valida que esté en estado BORRADOR
    2. Cambia estado
    3. Registra en historial
    4. TODO: Envía notificaciones (email + WhatsApp)
    """
    try:
        # Verificar pedido existe y está en estado correcto
        pedido = conn.execute("""
            SELECT id, numero_pedido, estado, tienda_destino_nombre
            FROM pedidos_sugeridos
            WHERE id = ?
        """, [pedido_id]).fetchone()

        if not pedido:
            raise HTTPException(status_code=404, detail="Pedido no encontrado")

        if pedido[2] != EstadoPedido.BORRADOR:
            raise HTTPException(
                status_code=400,
                detail=f"Pedido debe estar en estado BORRADOR. Estado actual: {pedido[2]}"
            )

        # Actualizar estado
        conn.execute("""
            UPDATE pedidos_sugeridos
            SET estado = ?,
                fecha_modificacion = CURRENT_TIMESTAMP
            WHERE id = ?
        """, [EstadoPedido.PENDIENTE_APROBACION_GERENTE, pedido_id])

        # Registrar en historial
        historial_id = str(uuid.uuid4())
        conn.execute("""
            INSERT INTO pedidos_sugeridos_historial (
                id, pedido_id, estado_anterior, estado_nuevo,
                motivo_cambio, usuario, fecha_cambio
            ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, [
            historial_id, pedido_id,
            EstadoPedido.BORRADOR,
            EstadoPedido.PENDIENTE_APROBACION_GERENTE,
            "Enviado para aprobación del gerente",
            "sistema"  # TODO: Get real user
        ])

        logger.info(f"✅ Pedido {pedido[1]} enviado para aprobación")

        # TODO: Enviar notificaciones
        # - Email al gerente de la tienda
        # - WhatsApp al gerente

        return {
            "success": True,
            "message": f"Pedido {pedido[1]} enviado para aprobación del gerente de {pedido[3]}",
            "pedido_id": pedido_id,
            "numero_pedido": pedido[1],
            "estado_nuevo": EstadoPedido.PENDIENTE_APROBACION_GERENTE
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error enviando pedido para aprobación: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error enviando pedido: {str(e)}")


# =====================================================================================
# LISTAR PEDIDOS
# =====================================================================================

@router.get("/", response_model=List[PedidoSugeridoResumen])
async def listar_pedidos(
    estado: Optional[str] = None,
    tienda_id: Optional[str] = None,
    conn: duckdb.DuckDBPyConnection = Depends(get_db)
):
    """
    Lista pedidos con filtros opcionales

    Filtros:
    - estado: borrador, pendiente_aprobacion_gerente, aprobado_gerente, finalizado
    - tienda_id: filtrar por tienda destino
    """
    try:
        query = """
            SELECT
                id, numero_pedido, fecha_pedido, fecha_creacion,
                cedi_origen_nombre, tienda_destino_nombre,
                estado, prioridad, tipo_pedido,
                total_productos, total_lineas, total_bultos, total_unidades, total_peso_kg,
                fecha_entrega_solicitada, fecha_aprobacion, fecha_recepcion,
                usuario_creador,
                CAST(DATEDIFF('day', fecha_creacion::DATE, CURRENT_DATE) AS INTEGER) as dias_desde_creacion
            FROM pedidos_sugeridos
            WHERE 1=1
        """

        params = []
        if estado:
            query += " AND estado = ?"
            params.append(estado)
        if tienda_id:
            query += " AND tienda_destino_id = ?"
            params.append(tienda_id)

        query += " ORDER BY fecha_creacion DESC LIMIT 100"

        result = conn.execute(query, params).fetchall()

        pedidos = []
        for row in result:
            # Calculate porcentaje_avance
            estado_pedido = row[6]
            if estado_pedido == EstadoPedido.FINALIZADO:
                porcentaje = 100
            elif estado_pedido == EstadoPedido.APROBADO_GERENTE:
                porcentaje = 75
            elif estado_pedido == EstadoPedido.PENDIENTE_APROBACION_GERENTE:
                porcentaje = 50
            elif estado_pedido == EstadoPedido.BORRADOR:
                porcentaje = 25
            else:
                porcentaje = 0

            pedidos.append(PedidoSugeridoResumen(
                id=row[0],
                numero_pedido=row[1],
                fecha_pedido=row[2],
                fecha_creacion=row[3],
                cedi_origen_nombre=row[4],
                tienda_destino_nombre=row[5],
                estado=row[6],
                prioridad=row[7],
                tipo_pedido=row[8],
                total_productos=row[9],
                total_lineas=row[10],
                total_bultos=row[11],
                total_unidades=row[12],
                total_peso_kg=row[13],
                fecha_entrega_solicitada=row[14],
                fecha_aprobacion=row[15],
                fecha_recepcion=row[16],
                usuario_creador=row[17],
                dias_desde_creacion=row[18],
                porcentaje_avance=porcentaje
            ))

        return pedidos

    except Exception as e:
        logger.error(f"❌ Error listando pedidos: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error listando pedidos: {str(e)}")


# =====================================================================================
# OBTENER PEDIDO COMPLETO
# =====================================================================================

@router.get("/{pedido_id}", response_model=PedidoSugeridoCompleto)
async def obtener_pedido(
    pedido_id: str,
    conn: duckdb.DuckDBPyConnection = Depends(get_db)
):
    """
    Obtiene pedido completo con todos los productos y devoluciones
    """
    try:
        # TODO: Implement full pedido retrieval with productos and devoluciones
        raise HTTPException(status_code=501, detail="Not implemented yet")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error obteniendo pedido: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error obteniendo pedido: {str(e)}")


# =====================================================================================
# APROBAR PEDIDO (GERENTE)
# =====================================================================================

@router.post("/{pedido_id}/aprobar")
async def aprobar_pedido(
    pedido_id: str,
    comentario_general: Optional[str] = None,
    conn: duckdb.DuckDBPyConnection = Depends(get_db)
):
    """
    Gerente aprueba el pedido

    Cambia estado: PENDIENTE_APROBACION_GERENTE → APROBADO_GERENTE
    """
    try:
        # Verificar pedido existe y está en estado correcto
        pedido = conn.execute("""
            SELECT id, numero_pedido, estado, tienda_destino_nombre
            FROM pedidos_sugeridos
            WHERE id = ?
        """, [pedido_id]).fetchone()

        if not pedido:
            raise HTTPException(status_code=404, detail="Pedido no encontrado")

        if pedido[2] != EstadoPedido.PENDIENTE_APROBACION_GERENTE:
            raise HTTPException(
                status_code=400,
                detail=f"Pedido debe estar en estado PENDIENTE_APROBACION_GERENTE. Estado actual: {pedido[2]}"
            )

        # Actualizar estado
        conn.execute("""
            UPDATE pedidos_sugeridos
            SET estado = ?,
                usuario_aprobador_gerente = ?,
                fecha_aprobacion_gerente = CURRENT_TIMESTAMP,
                fecha_modificacion = CURRENT_TIMESTAMP
            WHERE id = ?
        """, [EstadoPedido.APROBADO_GERENTE, "sistema", pedido_id])  # TODO: Get real user

        # Registrar en historial
        historial_id = str(uuid.uuid4())
        conn.execute("""
            INSERT INTO pedidos_sugeridos_historial (
                id, pedido_id, estado_anterior, estado_nuevo,
                motivo_cambio, usuario, fecha_cambio
            ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, [
            historial_id, pedido_id,
            EstadoPedido.PENDIENTE_APROBACION_GERENTE,
            EstadoPedido.APROBADO_GERENTE,
            comentario_general or "Aprobado por gerente",
            "sistema"  # TODO: Get real user
        ])

        logger.info(f"✅ Pedido {pedido[1]} aprobado por gerente")

        # TODO: Enviar notificación al analista

        return {
            "success": True,
            "message": f"Pedido {pedido[1]} aprobado exitosamente",
            "pedido_id": pedido_id,
            "numero_pedido": pedido[1],
            "estado_nuevo": EstadoPedido.APROBADO_GERENTE
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error aprobando pedido: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error aprobando pedido: {str(e)}")


# =====================================================================================
# RECHAZAR PEDIDO (GERENTE)
# =====================================================================================

@router.post("/{pedido_id}/rechazar")
async def rechazar_pedido(
    pedido_id: str,
    motivo: str,
    conn: duckdb.DuckDBPyConnection = Depends(get_db)
):
    """
    Gerente rechaza el pedido

    Cambia estado: PENDIENTE_APROBACION_GERENTE → RECHAZADO_GERENTE
    """
    try:
        # Verificar pedido existe y está en estado correcto
        pedido = conn.execute("""
            SELECT id, numero_pedido, estado, tienda_destino_nombre
            FROM pedidos_sugeridos
            WHERE id = ?
        """, [pedido_id]).fetchone()

        if not pedido:
            raise HTTPException(status_code=404, detail="Pedido no encontrado")

        if pedido[2] != EstadoPedido.PENDIENTE_APROBACION_GERENTE:
            raise HTTPException(
                status_code=400,
                detail=f"Pedido debe estar en estado PENDIENTE_APROBACION_GERENTE. Estado actual: {pedido[2]}"
            )

        # Actualizar estado
        conn.execute("""
            UPDATE pedidos_sugeridos
            SET estado = ?,
                usuario_aprobador_gerente = ?,
                fecha_modificacion = CURRENT_TIMESTAMP
            WHERE id = ?
        """, [EstadoPedido.RECHAZADO_GERENTE, "sistema", pedido_id])  # TODO: Get real user

        # Registrar en historial
        historial_id = str(uuid.uuid4())
        conn.execute("""
            INSERT INTO pedidos_sugeridos_historial (
                id, pedido_id, estado_anterior, estado_nuevo,
                motivo_cambio, usuario, fecha_cambio
            ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        """, [
            historial_id, pedido_id,
            EstadoPedido.PENDIENTE_APROBACION_GERENTE,
            EstadoPedido.RECHAZADO_GERENTE,
            motivo,
            "sistema"  # TODO: Get real user
        ])

        logger.info(f"❌ Pedido {pedido[1]} rechazado por gerente: {motivo}")

        # TODO: Enviar notificación al analista

        return {
            "success": True,
            "message": f"Pedido {pedido[1]} rechazado",
            "pedido_id": pedido_id,
            "numero_pedido": pedido[1],
            "estado_nuevo": EstadoPedido.RECHAZADO_GERENTE,
            "motivo": motivo
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error rechazando pedido: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error rechazando pedido: {str(e)}")


# =====================================================================================
# AGREGAR COMENTARIO A PRODUCTO
# =====================================================================================

@router.post("/{pedido_id}/productos/{producto_codigo}/comentario")
async def agregar_comentario_producto(
    pedido_id: str,
    producto_codigo: str,
    comentario: str,
    conn: duckdb.DuckDBPyConnection = Depends(get_db)
):
    """
    Gerente agrega comentario a un producto específico

    El comentario se guarda en la tabla de detalle del pedido
    """
    try:
        # Verificar que el producto existe en el pedido
        producto = conn.execute("""
            SELECT id FROM pedidos_sugeridos_detalle
            WHERE pedido_id = ? AND codigo_producto = ?
        """, [pedido_id, producto_codigo]).fetchone()

        if not producto:
            raise HTTPException(status_code=404, detail="Producto no encontrado en el pedido")

        # Actualizar comentario
        conn.execute("""
            UPDATE pedidos_sugeridos_detalle
            SET comentario_gerente = ?,
                comentario_revisado_analista = false,
                fecha_modificacion = CURRENT_TIMESTAMP
            WHERE pedido_id = ? AND codigo_producto = ?
        """, [comentario, pedido_id, producto_codigo])

        # Marcar el pedido como que tiene comentarios
        conn.execute("""
            UPDATE pedidos_sugeridos
            SET tiene_comentarios_gerente = true
            WHERE id = ?
        """, [pedido_id])

        logger.info(f"💬 Comentario agregado a producto {producto_codigo} en pedido {pedido_id}")

        return {
            "success": True,
            "message": "Comentario agregado exitosamente",
            "producto_codigo": producto_codigo,
            "comentario": comentario
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error agregando comentario: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error agregando comentario: {str(e)}")
