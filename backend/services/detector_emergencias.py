"""
Servicio de Detección de Emergencias de Inventario
Fluxion AI - Pedido de Emergencia v2

Detecta situaciones críticas de inventario basándose en:
- Cobertura de stock (stock_actual / demanda_restante)
- Factor de intensidad del día (ventas_reales / ventas_esperadas)
- Anomalías de inventario (stock negativo, ventas imposibles)
"""

import logging
import uuid
from datetime import datetime, date, timedelta
from decimal import Decimal
from typing import List, Optional, Tuple, Dict, Any
import psycopg2.extras

from db_manager import get_db_connection, get_db_connection_write
from models.emergencias import (
    TipoEmergencia,
    TipoAnomalia,
    SeveridadAnomalia,
    EstadoAnomalia,
    TriggerTipo,
    EstadoScan,
    ConfigTiendaResumen,
    ConfigTiendaCompleta,
    EmergenciaDetectada,
    EmergenciasResumen,
    AnomaliaDetectada,
    ScanResponse,
    FactorIntensidad,
)

logger = logging.getLogger(__name__)


# =============================================================================
# CONSTANTES
# =============================================================================

# Perfil horario por defecto (% de ventas diarias por hora)
# Basado en horario comercial típico de Venezuela (9am - 7pm)
PERFIL_HORARIO_DEFAULT = {
    9: 0.05,    # 5% de ventas
    10: 0.08,
    11: 0.10,
    12: 0.12,   # Pico mediodía
    13: 0.10,
    14: 0.08,
    15: 0.10,
    16: 0.12,   # Pico tarde
    17: 0.10,
    18: 0.10,
    19: 0.05,
}

# Umbrales por defecto
UMBRAL_CRITICO_DEFAULT = Decimal("0.25")
UMBRAL_INMINENTE_DEFAULT = Decimal("0.50")
UMBRAL_ALERTA_DEFAULT = Decimal("0.75")


# =============================================================================
# FUNCIONES DE CONFIGURACIÓN
# =============================================================================

def get_tiendas_habilitadas() -> List[ConfigTiendaResumen]:
    """
    Obtiene las tiendas habilitadas para detección de emergencias.

    Returns:
        Lista de tiendas con su configuración básica
    """
    query = """
        SELECT
            c.ubicacion_id,
            u.nombre AS nombre_tienda,
            c.habilitado,
            c.fecha_habilitacion,
            c.umbral_critico,
            c.umbral_inminente,
            c.umbral_alerta
        FROM emergencias_config_tienda c
        JOIN ubicaciones u ON c.ubicacion_id = u.id
        WHERE c.habilitado = TRUE
        ORDER BY u.nombre
    """

    with get_db_connection() as conn:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cursor.execute(query)
        rows = cursor.fetchall()
        cursor.close()

    return [ConfigTiendaResumen(**row) for row in rows]


def get_config_tienda(ubicacion_id: str) -> Optional[ConfigTiendaCompleta]:
    """
    Obtiene la configuración completa de una tienda.

    Args:
        ubicacion_id: ID de la tienda

    Returns:
        Configuración completa o None si no existe
    """
    query = """
        SELECT
            c.ubicacion_id,
            u.nombre AS nombre_tienda,
            c.habilitado,
            c.fecha_habilitacion,
            c.umbral_critico,
            c.umbral_inminente,
            c.umbral_alerta,
            c.emails_notificacion,
            c.notificaciones_activas,
            c.creado_por,
            c.fecha_creacion,
            c.fecha_actualizacion
        FROM emergencias_config_tienda c
        JOIN ubicaciones u ON c.ubicacion_id = u.id
        WHERE c.ubicacion_id = %s
    """

    with get_db_connection() as conn:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cursor.execute(query, (ubicacion_id,))
        row = cursor.fetchone()
        cursor.close()

    if row:
        return ConfigTiendaCompleta(**row)
    return None


def get_todas_tiendas_config() -> List[ConfigTiendaResumen]:
    """
    Obtiene todas las tiendas con su estado de configuración.
    Incluye tiendas no configuradas (habilitado = False por defecto).

    Returns:
        Lista de todas las tiendas con su configuración
    """
    query = """
        SELECT
            u.id AS ubicacion_id,
            u.nombre AS nombre_tienda,
            COALESCE(c.habilitado, FALSE) AS habilitado,
            c.fecha_habilitacion,
            COALESCE(c.umbral_critico, 0.25) AS umbral_critico,
            COALESCE(c.umbral_inminente, 0.50) AS umbral_inminente,
            COALESCE(c.umbral_alerta, 0.75) AS umbral_alerta
        FROM ubicaciones u
        LEFT JOIN emergencias_config_tienda c ON u.id = c.ubicacion_id
        WHERE u.activo = TRUE
        ORDER BY u.nombre
    """

    with get_db_connection() as conn:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cursor.execute(query)
        rows = cursor.fetchall()
        cursor.close()

    return [ConfigTiendaResumen(**row) for row in rows]


def habilitar_tienda(
    ubicacion_id: str,
    emails: List[str] = None,
    umbral_critico: Decimal = None,
    umbral_inminente: Decimal = None,
    umbral_alerta: Decimal = None,
    usuario: str = None
) -> bool:
    """
    Habilita una tienda para detección de emergencias.

    Args:
        ubicacion_id: ID de la tienda
        emails: Lista de emails para notificaciones
        umbral_critico: Umbral personalizado para CRITICO
        umbral_inminente: Umbral personalizado para INMINENTE
        umbral_alerta: Umbral personalizado para ALERTA
        usuario: Usuario que realiza la operación

    Returns:
        True si se habilitó correctamente
    """
    query = """
        INSERT INTO emergencias_config_tienda (
            ubicacion_id,
            habilitado,
            fecha_habilitacion,
            umbral_critico,
            umbral_inminente,
            umbral_alerta,
            emails_notificacion,
            creado_por,
            fecha_creacion,
            fecha_actualizacion
        ) VALUES (
            %s, TRUE, %s, %s, %s, %s, %s, %s, %s, %s
        )
        ON CONFLICT (ubicacion_id) DO UPDATE SET
            habilitado = TRUE,
            fecha_habilitacion = EXCLUDED.fecha_habilitacion,
            umbral_critico = COALESCE(EXCLUDED.umbral_critico, emergencias_config_tienda.umbral_critico),
            umbral_inminente = COALESCE(EXCLUDED.umbral_inminente, emergencias_config_tienda.umbral_inminente),
            umbral_alerta = COALESCE(EXCLUDED.umbral_alerta, emergencias_config_tienda.umbral_alerta),
            emails_notificacion = COALESCE(EXCLUDED.emails_notificacion, emergencias_config_tienda.emails_notificacion),
            fecha_actualizacion = EXCLUDED.fecha_actualizacion
    """

    ahora = datetime.now()

    with get_db_connection_write() as conn:
        cursor = conn.cursor()
        cursor.execute(query, (
            ubicacion_id,
            ahora,
            umbral_critico or UMBRAL_CRITICO_DEFAULT,
            umbral_inminente or UMBRAL_INMINENTE_DEFAULT,
            umbral_alerta or UMBRAL_ALERTA_DEFAULT,
            emails or [],
            usuario,
            ahora,
            ahora
        ))
        conn.commit()
        cursor.close()

    logger.info(f"Tienda {ubicacion_id} habilitada para emergencias por {usuario}")
    return True


def deshabilitar_tienda(ubicacion_id: str) -> bool:
    """
    Deshabilita una tienda para detección de emergencias.

    Args:
        ubicacion_id: ID de la tienda

    Returns:
        True si se deshabilitó correctamente
    """
    query = """
        UPDATE emergencias_config_tienda
        SET habilitado = FALSE,
            fecha_actualizacion = %s
        WHERE ubicacion_id = %s
    """

    with get_db_connection_write() as conn:
        cursor = conn.cursor()
        cursor.execute(query, (datetime.now(), ubicacion_id))
        conn.commit()
        cursor.close()

    logger.info(f"Tienda {ubicacion_id} deshabilitada para emergencias")
    return True


# =============================================================================
# FUNCIONES DE CÁLCULO
# =============================================================================

def calcular_porcentaje_dia_transcurrido(hora_actual: int) -> Decimal:
    """
    Calcula qué porcentaje del día de ventas ha transcurrido.
    Basado en perfil horario por defecto.

    Args:
        hora_actual: Hora actual (0-23)

    Returns:
        Porcentaje del día transcurrido (0.0 - 1.0)
    """
    total = Decimal("0")

    for hora, pct in PERFIL_HORARIO_DEFAULT.items():
        if hora < hora_actual:
            total += Decimal(str(pct))
        elif hora == hora_actual:
            # Hora actual: asumimos mitad de la hora
            total += Decimal(str(pct)) / 2

    return min(total, Decimal("1.0"))


def calcular_factor_intensidad(
    ubicacion_id: str,
    fecha: date = None
) -> Tuple[Decimal, Decimal, Decimal]:
    """
    Calcula el factor de intensidad del día para una tienda.

    Factor = ventas_reales_hasta_ahora / ventas_esperadas_hasta_ahora

    - Factor > 1.0: Día más intenso de lo normal
    - Factor < 1.0: Día más tranquilo de lo normal

    Args:
        ubicacion_id: ID de la tienda
        fecha: Fecha a calcular (default: hoy)

    Returns:
        Tuple (factor_intensidad, ventas_reales, ventas_esperadas)
    """
    if fecha is None:
        fecha = date.today()

    hora_actual = datetime.now().hour
    pct_dia = calcular_porcentaje_dia_transcurrido(hora_actual)

    # Obtener ventas del mismo día de la semana en últimas 4 semanas
    dia_semana = fecha.weekday()  # 0=Lunes, 6=Domingo

    query_historico = """
        SELECT COALESCE(AVG(total_dia), 0) AS promedio_dia
        FROM (
            SELECT
                fecha_venta::date AS dia,
                SUM(venta_total) AS total_dia
            FROM ventas
            WHERE ubicacion_id = %s
              AND EXTRACT(DOW FROM fecha_venta) = %s
              AND fecha_venta >= %s
              AND fecha_venta < %s
            GROUP BY fecha_venta::date
        ) sub
    """

    query_hoy = """
        SELECT COALESCE(SUM(venta_total), 0) AS total_hoy
        FROM ventas
        WHERE ubicacion_id = %s
          AND fecha_venta::date = %s
    """

    fecha_inicio = fecha - timedelta(days=28)  # 4 semanas atrás

    with get_db_connection() as conn:
        cursor = conn.cursor()

        # Promedio histórico del mismo día de semana
        cursor.execute(query_historico, (
            ubicacion_id,
            dia_semana,
            fecha_inicio,
            fecha
        ))
        promedio_dia = Decimal(str(cursor.fetchone()[0] or 0))

        # Ventas de hoy
        cursor.execute(query_hoy, (ubicacion_id, fecha))
        ventas_hoy = Decimal(str(cursor.fetchone()[0] or 0))

        cursor.close()

    # Ventas esperadas hasta ahora
    ventas_esperadas = promedio_dia * pct_dia

    # Factor de intensidad
    if ventas_esperadas > 0:
        factor = ventas_hoy / ventas_esperadas
    else:
        factor = Decimal("1.0")  # Sin datos históricos, asumir normal

    return factor, ventas_hoy, ventas_esperadas


def clasificar_intensidad(factor: Decimal) -> str:
    """Clasifica el nivel de intensidad según el factor."""
    if factor < Decimal("0.5"):
        return "MUY_BAJO"
    elif factor < Decimal("0.8"):
        return "BAJO"
    elif factor <= Decimal("1.2"):
        return "NORMAL"
    elif factor <= Decimal("1.5"):
        return "ALTO"
    else:
        return "MUY_ALTO"


def clasificar_emergencia(
    cobertura: Decimal,
    umbral_critico: Decimal = UMBRAL_CRITICO_DEFAULT,
    umbral_inminente: Decimal = UMBRAL_INMINENTE_DEFAULT,
    umbral_alerta: Decimal = UMBRAL_ALERTA_DEFAULT
) -> Optional[TipoEmergencia]:
    """
    Clasifica el tipo de emergencia según la cobertura.

    Cobertura = stock_actual / demanda_restante_del_dia

    Args:
        cobertura: Ratio de cobertura (0.0 - inf)
        umbral_*: Umbrales personalizados

    Returns:
        TipoEmergencia o None si no hay emergencia
    """
    if cobertura <= 0:
        return TipoEmergencia.STOCKOUT
    elif cobertura < umbral_critico:
        return TipoEmergencia.CRITICO
    elif cobertura < umbral_inminente:
        return TipoEmergencia.INMINENTE
    elif cobertura < umbral_alerta:
        return TipoEmergencia.ALERTA
    else:
        return None  # Stock suficiente


# =============================================================================
# DETECCIÓN DE ANOMALÍAS
# =============================================================================

def detectar_anomalias_tienda(
    ubicacion_id: str,
    scan_id: str
) -> List[AnomaliaDetectada]:
    """
    Detecta anomalías de inventario para una tienda.

    Tipos de anomalías:
    - STOCK_NEGATIVO: Stock < 0
    - VENTA_IMPOSIBLE: Venta sin stock suficiente

    Args:
        ubicacion_id: ID de la tienda
        scan_id: ID del scan actual

    Returns:
        Lista de anomalías detectadas
    """
    anomalias = []

    # 1. Stock negativo
    query_negativo = """
        SELECT
            i.ubicacion_id,
            u.nombre AS nombre_tienda,
            i.producto_id,
            p.nombre AS nombre_producto,
            i.almacen_codigo,
            i.cantidad
        FROM inventario_actual i
        JOIN ubicaciones u ON i.ubicacion_id = u.id
        JOIN productos p ON i.producto_id = p.id
        WHERE i.ubicacion_id = %s
          AND i.cantidad < 0
    """

    with get_db_connection() as conn:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        cursor.execute(query_negativo, (ubicacion_id,))
        rows_negativos = cursor.fetchall()

        cursor.close()

    for row in rows_negativos:
        anomalias.append(AnomaliaDetectada(
            ubicacion_id=row['ubicacion_id'],
            nombre_tienda=row['nombre_tienda'],
            producto_id=row['producto_id'],
            nombre_producto=row['nombre_producto'],
            almacen_codigo=row['almacen_codigo'],
            tipo_anomalia=TipoAnomalia.STOCK_NEGATIVO,
            severidad=SeveridadAnomalia.ALTA,
            valor_detectado=Decimal(str(row['cantidad'])),
            valor_esperado=Decimal("0"),
            descripcion=f"Stock negativo detectado: {row['cantidad']} unidades"
        ))

    return anomalias


def guardar_anomalias(anomalias: List[AnomaliaDetectada], scan_id: str):
    """Guarda las anomalías detectadas en la BD."""
    if not anomalias:
        return

    query = """
        INSERT INTO emergencias_anomalias (
            ubicacion_id,
            producto_id,
            almacen_codigo,
            tipo_anomalia,
            valor_detectado,
            valor_esperado,
            desviacion_porcentual,
            descripcion,
            severidad,
            estado,
            fecha_deteccion,
            scan_id
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
        )
    """

    with get_db_connection_write() as conn:
        cursor = conn.cursor()

        for a in anomalias:
            cursor.execute(query, (
                a.ubicacion_id,
                a.producto_id,
                a.almacen_codigo,
                a.tipo_anomalia.value,
                a.valor_detectado,
                a.valor_esperado,
                a.desviacion_porcentual,
                a.descripcion,
                a.severidad.value,
                EstadoAnomalia.PENDIENTE.value,
                datetime.now(),
                scan_id
            ))

        conn.commit()
        cursor.close()

    logger.info(f"Guardadas {len(anomalias)} anomalías para scan {scan_id}")


# =============================================================================
# DETECCIÓN PRINCIPAL DE EMERGENCIAS
# =============================================================================

def detectar_emergencias(
    tiendas: List[str] = None,
    incluir_anomalias: bool = True,
    trigger_tipo: TriggerTipo = TriggerTipo.MANUAL,
    trigger_usuario: str = None
) -> ScanResponse:
    """
    Ejecuta detección de emergencias de inventario.

    Args:
        tiendas: Lista de ubicacion_id a escanear. None = todas las habilitadas.
        incluir_anomalias: Si detectar también anomalías
        trigger_tipo: Tipo de trigger (MANUAL, SCHEDULER, API)
        trigger_usuario: Usuario que inició el scan

    Returns:
        ScanResponse con resultados del scan
    """
    scan_id = str(uuid.uuid4())[:8]
    fecha_inicio = datetime.now()

    logger.info(f"Iniciando scan de emergencias {scan_id}")

    # Obtener tiendas a escanear
    if tiendas:
        # Filtrar solo las habilitadas de la lista solicitada
        todas_config = {t.ubicacion_id: t for t in get_tiendas_habilitadas()}
        tiendas_a_escanear = [
            todas_config[t] for t in tiendas
            if t in todas_config
        ]
    else:
        tiendas_a_escanear = get_tiendas_habilitadas()

    if not tiendas_a_escanear:
        logger.warning("No hay tiendas habilitadas para escanear")
        return ScanResponse(
            scan_id=scan_id,
            fecha_inicio=fecha_inicio,
            fecha_fin=datetime.now(),
            duracion_ms=0,
            trigger_tipo=trigger_tipo,
            trigger_usuario=trigger_usuario,
            tiendas_escaneadas=[],
            total_productos_analizados=0,
            total_emergencias=0,
            total_anomalias=0,
            emergencias=[],
            anomalias=[],
            resumen_por_tienda=[]
        )

    todas_emergencias: List[EmergenciaDetectada] = []
    todas_anomalias: List[AnomaliaDetectada] = []
    resumenes: List[EmergenciasResumen] = []
    total_productos = 0

    # Procesar cada tienda
    for config_tienda in tiendas_a_escanear:
        ubicacion_id = config_tienda.ubicacion_id
        nombre_tienda = config_tienda.nombre_tienda

        logger.info(f"Escaneando tienda {ubicacion_id} ({nombre_tienda})")

        # Calcular factor de intensidad del día
        factor_intensidad, ventas_hoy, ventas_esperadas = calcular_factor_intensidad(ubicacion_id)

        # Obtener productos con stock y ventas de hoy
        query_productos = """
            WITH stock_tienda AS (
                SELECT
                    producto_id,
                    SUM(cantidad) AS stock_actual,
                    MAX(almacen_codigo) AS almacen_codigo
                FROM inventario_actual
                WHERE ubicacion_id = %s
                GROUP BY producto_id
            ),
            ventas_hoy AS (
                SELECT
                    producto_id,
                    SUM(cantidad_vendida) AS cantidad_vendida
                FROM ventas
                WHERE ubicacion_id = %s
                  AND fecha_venta::date = %s
                GROUP BY producto_id
            ),
            demanda_promedio AS (
                SELECT
                    producto_id,
                    AVG(cantidad_dia) AS demanda_diaria_promedio
                FROM (
                    SELECT
                        producto_id,
                        fecha_venta::date AS dia,
                        SUM(cantidad_vendida) AS cantidad_dia
                    FROM ventas
                    WHERE ubicacion_id = %s
                      AND fecha_venta >= %s
                    GROUP BY producto_id, fecha_venta::date
                ) sub
                GROUP BY producto_id
            ),
            abc_productos AS (
                SELECT
                    puc.producto_id,
                    puc.clase_abc
                FROM productos_abc_tienda puc
                WHERE puc.ubicacion_id = %s
            )
            SELECT
                p.id AS producto_id,
                p.nombre AS nombre_producto,
                p.categoria,
                COALESCE(abc.clase_abc, 'D') AS clase_abc,
                COALESCE(s.stock_actual, 0) AS stock_actual,
                s.almacen_codigo,
                COALESCE(v.cantidad_vendida, 0) AS ventas_hoy,
                COALESCE(d.demanda_diaria_promedio, 0) AS demanda_diaria_promedio
            FROM productos p
            LEFT JOIN stock_tienda s ON p.id = s.producto_id
            LEFT JOIN ventas_hoy v ON p.id = v.producto_id
            LEFT JOIN demanda_promedio d ON p.id = d.producto_id
            LEFT JOIN abc_productos abc ON p.id = abc.producto_id
            WHERE (s.stock_actual IS NOT NULL OR v.cantidad_vendida IS NOT NULL)
              AND p.activo = TRUE
            ORDER BY COALESCE(abc.clase_abc, 'D'), p.nombre
        """

        fecha_hoy = date.today()
        fecha_inicio_historico = fecha_hoy - timedelta(days=30)
        hora_actual = datetime.now().hour
        pct_dia_restante = Decimal("1.0") - calcular_porcentaje_dia_transcurrido(hora_actual)

        emergencias_tienda: List[EmergenciaDetectada] = []

        with get_db_connection() as conn:
            cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
            cursor.execute(query_productos, (
                ubicacion_id,
                ubicacion_id,
                fecha_hoy,
                ubicacion_id,
                fecha_inicio_historico,
                ubicacion_id
            ))
            productos = cursor.fetchall()
            cursor.close()

        total_productos += len(productos)

        for prod in productos:
            stock_actual = Decimal(str(prod['stock_actual']))
            ventas_hoy_prod = Decimal(str(prod['ventas_hoy']))
            demanda_diaria = Decimal(str(prod['demanda_diaria_promedio']))

            # FILTRO: Solo alertar productos con demanda real (ventas en últimos 30 días)
            if demanda_diaria <= 0:
                continue  # Sin demanda histórica = no es emergencia

            # Calcular demanda restante del día
            # demanda_restante = (demanda_diaria * factor_intensidad * pct_dia_restante)
            demanda_restante = demanda_diaria * factor_intensidad * pct_dia_restante

            # FILTRO: Si no hay demanda restante esperada, no es emergencia
            # (ya sea porque es tarde en el día o porque el factor de intensidad es bajo)
            if demanda_restante <= Decimal("0.1"):
                continue  # Sin demanda restante significativa = no es emergencia hoy

            # Calcular cobertura
            cobertura = stock_actual / demanda_restante

            # Clasificar emergencia
            tipo_emergencia = clasificar_emergencia(
                cobertura,
                config_tienda.umbral_critico,
                config_tienda.umbral_inminente,
                config_tienda.umbral_alerta
            )

            if tipo_emergencia:
                # Calcular horas restantes
                if demanda_diaria > 0:
                    horas_restantes = (stock_actual / (demanda_diaria / Decimal("10")))  # Aprox 10 horas de operación
                else:
                    horas_restantes = None

                emergencia = EmergenciaDetectada(
                    ubicacion_id=ubicacion_id,
                    nombre_tienda=nombre_tienda,
                    producto_id=prod['producto_id'],
                    nombre_producto=prod['nombre_producto'],
                    categoria=prod['categoria'],
                    clase_abc=prod['clase_abc'],
                    tipo_emergencia=tipo_emergencia,
                    stock_actual=stock_actual,
                    ventas_hoy=ventas_hoy_prod,
                    demanda_restante=round(demanda_restante, 2),
                    cobertura=round(cobertura, 4),
                    factor_intensidad=round(factor_intensidad, 4),
                    horas_restantes=round(horas_restantes, 1) if horas_restantes else None,
                    almacen_codigo=prod['almacen_codigo']
                )
                emergencias_tienda.append(emergencia)

        # Agregar emergencias de esta tienda
        todas_emergencias.extend(emergencias_tienda)

        # Detectar anomalías si está habilitado
        if incluir_anomalias:
            anomalias_tienda = detectar_anomalias_tienda(ubicacion_id, scan_id)
            todas_anomalias.extend(anomalias_tienda)

        # Crear resumen de tienda
        resumen = EmergenciasResumen(
            ubicacion_id=ubicacion_id,
            nombre_tienda=nombre_tienda,
            total_emergencias=len(emergencias_tienda),
            stockouts=sum(1 for e in emergencias_tienda if e.tipo_emergencia == TipoEmergencia.STOCKOUT),
            criticos=sum(1 for e in emergencias_tienda if e.tipo_emergencia == TipoEmergencia.CRITICO),
            inminentes=sum(1 for e in emergencias_tienda if e.tipo_emergencia == TipoEmergencia.INMINENTE),
            alertas=sum(1 for e in emergencias_tienda if e.tipo_emergencia == TipoEmergencia.ALERTA),
            factor_intensidad_promedio=round(factor_intensidad, 4)
        )
        resumenes.append(resumen)

    # Guardar anomalías en BD
    if todas_anomalias:
        guardar_anomalias(todas_anomalias, scan_id)

    fecha_fin = datetime.now()
    duracion_ms = int((fecha_fin - fecha_inicio).total_seconds() * 1000)

    # Guardar registro del scan
    guardar_scan(
        scan_id=scan_id,
        fecha_inicio=fecha_inicio,
        fecha_fin=fecha_fin,
        duracion_ms=duracion_ms,
        tiendas=[t.ubicacion_id for t in tiendas_a_escanear],
        total_productos=total_productos,
        emergencias=len(todas_emergencias),
        anomalias=len(todas_anomalias),
        stockouts=sum(1 for e in todas_emergencias if e.tipo_emergencia == TipoEmergencia.STOCKOUT),
        criticos=sum(1 for e in todas_emergencias if e.tipo_emergencia == TipoEmergencia.CRITICO),
        inminentes=sum(1 for e in todas_emergencias if e.tipo_emergencia == TipoEmergencia.INMINENTE),
        alertas=sum(1 for e in todas_emergencias if e.tipo_emergencia == TipoEmergencia.ALERTA),
        trigger_tipo=trigger_tipo,
        trigger_usuario=trigger_usuario
    )

    logger.info(
        f"Scan {scan_id} completado en {duracion_ms}ms: "
        f"{len(todas_emergencias)} emergencias, {len(todas_anomalias)} anomalías"
    )

    return ScanResponse(
        scan_id=scan_id,
        fecha_inicio=fecha_inicio,
        fecha_fin=fecha_fin,
        duracion_ms=duracion_ms,
        trigger_tipo=trigger_tipo,
        trigger_usuario=trigger_usuario,
        tiendas_escaneadas=[t.ubicacion_id for t in tiendas_a_escanear],
        total_productos_analizados=total_productos,
        total_emergencias=len(todas_emergencias),
        total_anomalias=len(todas_anomalias),
        stockouts=sum(1 for e in todas_emergencias if e.tipo_emergencia == TipoEmergencia.STOCKOUT),
        criticos=sum(1 for e in todas_emergencias if e.tipo_emergencia == TipoEmergencia.CRITICO),
        inminentes=sum(1 for e in todas_emergencias if e.tipo_emergencia == TipoEmergencia.INMINENTE),
        alertas=sum(1 for e in todas_emergencias if e.tipo_emergencia == TipoEmergencia.ALERTA),
        emergencias=todas_emergencias,
        anomalias=todas_anomalias,
        resumen_por_tienda=resumenes
    )


def guardar_scan(
    scan_id: str,
    fecha_inicio: datetime,
    fecha_fin: datetime,
    duracion_ms: int,
    tiendas: List[str],
    total_productos: int,
    emergencias: int,
    anomalias: int,
    stockouts: int,
    criticos: int,
    inminentes: int,
    alertas: int,
    trigger_tipo: TriggerTipo,
    trigger_usuario: str = None
):
    """Guarda el registro del scan en la BD."""
    query = """
        INSERT INTO emergencias_scans (
            id,
            fecha_inicio,
            fecha_fin,
            duracion_ms,
            tiendas_escaneadas,
            total_productos_analizados,
            emergencias_detectadas,
            anomalias_detectadas,
            stockouts,
            criticos,
            inminentes,
            alertas,
            estado,
            trigger_tipo,
            trigger_usuario
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
        )
    """

    with get_db_connection_write() as conn:
        cursor = conn.cursor()
        cursor.execute(query, (
            scan_id,
            fecha_inicio,
            fecha_fin,
            duracion_ms,
            tiendas,
            total_productos,
            emergencias,
            anomalias,
            stockouts,
            criticos,
            inminentes,
            alertas,
            EstadoScan.COMPLETADO.value,
            trigger_tipo.value,
            trigger_usuario
        ))
        conn.commit()
        cursor.close()


# =============================================================================
# CONSULTAS
# =============================================================================

def obtener_anomalias_pendientes(
    ubicacion_id: str = None,
    tipo: TipoAnomalia = None,
    limit: int = 100
) -> List[AnomaliaDetectada]:
    """
    Obtiene anomalías pendientes de revisión.

    Args:
        ubicacion_id: Filtrar por tienda
        tipo: Filtrar por tipo de anomalía
        limit: Máximo de registros a retornar

    Returns:
        Lista de anomalías pendientes
    """
    query = """
        SELECT
            a.id,
            a.ubicacion_id,
            u.nombre AS nombre_tienda,
            a.producto_id,
            p.nombre AS nombre_producto,
            a.almacen_codigo,
            a.tipo_anomalia,
            a.severidad,
            a.valor_detectado,
            a.valor_esperado,
            a.desviacion_porcentual,
            a.descripcion,
            a.estado,
            a.fecha_deteccion
        FROM emergencias_anomalias a
        JOIN ubicaciones u ON a.ubicacion_id = u.id
        JOIN productos p ON a.producto_id = p.id
        WHERE a.estado = 'PENDIENTE'
    """
    params = []

    if ubicacion_id:
        query += " AND a.ubicacion_id = %s"
        params.append(ubicacion_id)

    if tipo:
        query += " AND a.tipo_anomalia = %s"
        params.append(tipo.value)

    query += " ORDER BY a.fecha_deteccion DESC LIMIT %s"
    params.append(limit)

    with get_db_connection() as conn:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()
        cursor.close()

    anomalias = []
    for row in rows:
        anomalias.append(AnomaliaDetectada(
            ubicacion_id=row['ubicacion_id'],
            nombre_tienda=row['nombre_tienda'],
            producto_id=row['producto_id'],
            nombre_producto=row['nombre_producto'],
            almacen_codigo=row['almacen_codigo'],
            tipo_anomalia=TipoAnomalia(row['tipo_anomalia']),
            severidad=SeveridadAnomalia(row['severidad']),
            valor_detectado=Decimal(str(row['valor_detectado'])),
            valor_esperado=Decimal(str(row['valor_esperado'])) if row['valor_esperado'] else None,
            desviacion_porcentual=Decimal(str(row['desviacion_porcentual'])) if row['desviacion_porcentual'] else None,
            descripcion=row['descripcion'],
            estado=EstadoAnomalia(row['estado']),
            fecha_deteccion=row['fecha_deteccion']
        ))

    return anomalias


def obtener_factor_intensidad_todas_tiendas() -> List[FactorIntensidad]:
    """
    Obtiene el factor de intensidad del día actual para todas las tiendas habilitadas.

    Returns:
        Lista de factores por tienda
    """
    tiendas = get_tiendas_habilitadas()
    factores = []

    fecha_hoy = date.today()
    hora_actual = datetime.now().hour
    pct_dia = calcular_porcentaje_dia_transcurrido(hora_actual)

    for config in tiendas:
        factor, ventas_reales, ventas_esperadas = calcular_factor_intensidad(
            config.ubicacion_id,
            fecha_hoy
        )

        factores.append(FactorIntensidad(
            ubicacion_id=config.ubicacion_id,
            nombre_tienda=config.nombre_tienda,
            fecha=fecha_hoy,
            ventas_esperadas_hasta_ahora=round(ventas_esperadas, 2),
            ventas_reales_hasta_ahora=round(ventas_reales, 2),
            factor_intensidad=round(factor, 4),
            intensidad=clasificar_intensidad(factor),
            hora_actual=hora_actual,
            porcentaje_dia_transcurrido=round(pct_dia * 100, 2)
        ))

    return factores


# =============================================================================
# DETALLE DE PRODUCTO PARA MODAL DE EMERGENCIA
# =============================================================================

def obtener_detalle_producto_emergencia(
    ubicacion_id: str,
    producto_id: str
) -> Dict[str, Any]:
    """
    Obtiene datos detallados de un producto para el modal de emergencia,
    incluyendo comparativos de ventas por hora y proyecciones.

    Args:
        ubicacion_id: ID de la tienda
        producto_id: ID del producto

    Returns:
        Diccionario con:
        - info_producto: nombre, categoria, clase_abc
        - stock_actual, ventas_hoy
        - comparativo: ventas hoy vs ayer vs semana pasada por hora
        - proyeccion: estimación de venta para el resto del día
    """
    fecha_hoy = date.today()
    fecha_ayer = fecha_hoy - timedelta(days=1)
    fecha_semana_pasada = fecha_hoy - timedelta(days=7)
    hora_actual = datetime.now().hour

    with get_db_connection() as conn:
        cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

        # 1. Info del producto
        cursor.execute("""
            SELECT
                p.id AS producto_id,
                p.nombre AS nombre_producto,
                p.categoria,
                abc.clasificacion AS clase_abc
            FROM productos p
            LEFT JOIN clasificacion_abc abc ON p.id = abc.producto_id AND abc.ubicacion_id = %s
            WHERE p.id = %s
        """, (ubicacion_id, producto_id))
        producto = cursor.fetchone()

        if not producto:
            cursor.close()
            return None

        # 2. Info de la tienda
        cursor.execute("SELECT nombre FROM ubicaciones WHERE id = %s", (ubicacion_id,))
        tienda = cursor.fetchone()
        nombre_tienda = tienda['nombre'] if tienda else ubicacion_id

        # 3. Stock actual
        cursor.execute("""
            SELECT COALESCE(SUM(cantidad), 0) AS stock
            FROM inventario_actual
            WHERE ubicacion_id = %s AND producto_id = %s
        """, (ubicacion_id, producto_id))
        stock_row = cursor.fetchone()
        stock_actual = Decimal(str(stock_row['stock'] or 0))

        # 4. Ventas de hoy por hora
        cursor.execute("""
            SELECT
                EXTRACT(HOUR FROM fecha_venta)::int AS hora,
                COALESCE(SUM(cantidad), 0) AS cantidad
            FROM ventas
            WHERE ubicacion_id = %s
              AND producto_id = %s
              AND DATE(fecha_venta) = %s
            GROUP BY EXTRACT(HOUR FROM fecha_venta)
            ORDER BY hora
        """, (ubicacion_id, producto_id, fecha_hoy))
        ventas_hoy_rows = cursor.fetchall()

        # 5. Ventas de ayer por hora
        cursor.execute("""
            SELECT
                EXTRACT(HOUR FROM fecha_venta)::int AS hora,
                COALESCE(SUM(cantidad), 0) AS cantidad
            FROM ventas
            WHERE ubicacion_id = %s
              AND producto_id = %s
              AND DATE(fecha_venta) = %s
            GROUP BY EXTRACT(HOUR FROM fecha_venta)
            ORDER BY hora
        """, (ubicacion_id, producto_id, fecha_ayer))
        ventas_ayer_rows = cursor.fetchall()

        # 6. Ventas del mismo día de la semana pasada por hora
        cursor.execute("""
            SELECT
                EXTRACT(HOUR FROM fecha_venta)::int AS hora,
                COALESCE(SUM(cantidad), 0) AS cantidad
            FROM ventas
            WHERE ubicacion_id = %s
              AND producto_id = %s
              AND DATE(fecha_venta) = %s
            GROUP BY EXTRACT(HOUR FROM fecha_venta)
            ORDER BY hora
        """, (ubicacion_id, producto_id, fecha_semana_pasada))
        ventas_semana_rows = cursor.fetchall()

        # 7. Promedio histórico por hora (últimos 30 días, mismo día de la semana)
        cursor.execute("""
            SELECT
                EXTRACT(HOUR FROM fecha_venta)::int AS hora,
                COALESCE(AVG(cantidad_diaria), 0) AS cantidad
            FROM (
                SELECT
                    DATE(fecha_venta) AS fecha,
                    EXTRACT(HOUR FROM fecha_venta)::int AS hora,
                    SUM(cantidad) AS cantidad_diaria
                FROM ventas
                WHERE ubicacion_id = %s
                  AND producto_id = %s
                  AND fecha_venta >= %s - INTERVAL '30 days'
                  AND fecha_venta < %s
                  AND EXTRACT(DOW FROM fecha_venta) = EXTRACT(DOW FROM %s::date)
                GROUP BY DATE(fecha_venta), EXTRACT(HOUR FROM fecha_venta)
            ) subq
            GROUP BY hora
            ORDER BY hora
        """, (ubicacion_id, producto_id, fecha_hoy, fecha_hoy, fecha_hoy))
        promedio_rows = cursor.fetchall()

        # 8. Totales de ventas para comparar
        cursor.execute("""
            SELECT
                COALESCE(SUM(CASE WHEN DATE(fecha_venta) = %s THEN cantidad ELSE 0 END), 0) AS ventas_hoy,
                COALESCE(SUM(CASE WHEN DATE(fecha_venta) = %s THEN cantidad ELSE 0 END), 0) AS ventas_ayer,
                COALESCE(SUM(CASE WHEN DATE(fecha_venta) = %s THEN cantidad ELSE 0 END), 0) AS ventas_semana
            FROM ventas
            WHERE ubicacion_id = %s AND producto_id = %s
        """, (fecha_hoy, fecha_ayer, fecha_semana_pasada, ubicacion_id, producto_id))
        totales = cursor.fetchone()

        # 9. Promedio 30 días
        cursor.execute("""
            SELECT COALESCE(AVG(cantidad_diaria), 0) AS promedio
            FROM (
                SELECT DATE(fecha_venta), SUM(cantidad) AS cantidad_diaria
                FROM ventas
                WHERE ubicacion_id = %s
                  AND producto_id = %s
                  AND fecha_venta >= %s - INTERVAL '30 days'
                  AND fecha_venta < %s
                GROUP BY DATE(fecha_venta)
            ) subq
        """, (ubicacion_id, producto_id, fecha_hoy, fecha_hoy))
        prom_row = cursor.fetchone()

        cursor.close()

    # Convertir a diccionarios por hora (con manejo de None)
    ventas_hoy_dict = {int(r['hora']): Decimal(str(r['cantidad'] or 0)) for r in ventas_hoy_rows}
    ventas_ayer_dict = {int(r['hora']): Decimal(str(r['cantidad'] or 0)) for r in ventas_ayer_rows}
    ventas_semana_dict = {int(r['hora']): Decimal(str(r['cantidad'] or 0)) for r in ventas_semana_rows}
    promedio_dict = {int(r['hora']): Decimal(str(r['cantidad'] or 0)) for r in promedio_rows}

    # Calcular factor de intensidad
    factor, ventas_esperadas_total, ventas_reales_total = calcular_factor_intensidad(ubicacion_id, fecha_hoy)

    # Construir arrays horarios (9am - 7pm)
    horas_operacion = list(range(9, 20))  # 9am a 7pm

    def construir_ventas_horarias(ventas_dict: Dict[int, Decimal], proyectar: bool = False) -> List[Dict]:
        resultado = []
        acumulado = Decimal("0")
        for hora in horas_operacion:
            cantidad = ventas_dict.get(hora, Decimal("0"))

            # Para hoy, proyectar horas futuras
            es_proyeccion = False
            if proyectar and hora > hora_actual:
                # Usar promedio histórico para proyectar
                cantidad = promedio_dict.get(hora, Decimal("0")) * factor
                es_proyeccion = True

            acumulado += cantidad
            resultado.append({
                'hora': hora,
                'cantidad': float(round(cantidad, 1)),
                'acumulado': float(round(acumulado, 1)),
                'es_proyeccion': es_proyeccion
            })
        return resultado

    # Construir ventas horarias
    hoy_con_proyeccion = construir_ventas_horarias(ventas_hoy_dict, proyectar=True)
    ayer_horario = construir_ventas_horarias(ventas_ayer_dict)
    semana_horario = construir_ventas_horarias(ventas_semana_dict)
    promedio_horario = construir_ventas_horarias(promedio_dict)

    # Calcular proyección total del día
    proyeccion_total = sum(h['cantidad'] for h in hoy_con_proyeccion)

    # Estimar hora de agotamiento (si aplica)
    hora_agotamiento = None
    if stock_actual > 0:
        stock_simulado = float(stock_actual)
        for h in hoy_con_proyeccion:
            if h['hora'] > hora_actual:
                stock_simulado -= h['cantidad']
                if stock_simulado <= 0:
                    hora_agotamiento = h['hora']
                    break

    ventas_hoy_total = Decimal(str(totales['ventas_hoy'] or 0))
    ventas_ayer_total = Decimal(str(totales['ventas_ayer'] or 0))
    ventas_semana_total = Decimal(str(totales['ventas_semana'] or 0))
    promedio_30 = Decimal(str(prom_row['promedio'] or 0))

    # Calcular demanda restante
    pct_dia_restante = Decimal("1") - Decimal(str(calcular_porcentaje_dia_transcurrido(hora_actual)))
    # Asegurar que factor es Decimal
    factor_decimal = Decimal(str(factor)) if not isinstance(factor, Decimal) else factor
    demanda_restante = promedio_30 * factor_decimal * pct_dia_restante

    # Cobertura
    if demanda_restante > 0:
        cobertura = stock_actual / demanda_restante
    elif stock_actual > 0:
        cobertura = Decimal("999")
    else:
        cobertura = Decimal("0")

    return {
        'ubicacion_id': ubicacion_id,
        'nombre_tienda': nombre_tienda,
        'producto_id': producto_id,
        'nombre_producto': producto['nombre_producto'],
        'categoria': producto['categoria'],
        'clase_abc': producto['clase_abc'],
        'stock_actual': float(stock_actual),
        'ventas_hoy': float(ventas_hoy_total),
        'ventas_ayer': float(ventas_ayer_total),
        'ventas_semana_pasada': float(ventas_semana_total),
        'promedio_30_dias': float(round(promedio_30, 1)),
        'demanda_restante': float(round(demanda_restante, 1)),
        'cobertura': float(round(cobertura, 4)),
        'factor_intensidad': float(round(factor, 2)),
        'intensidad': clasificar_intensidad(factor),
        'proyeccion_venta_dia': float(round(proyeccion_total, 1)),
        'hora_agotamiento_estimada': hora_agotamiento,
        'hora_actual': hora_actual,
        'comparativo_ventas': {
            'hoy': hoy_con_proyeccion,
            'ayer': ayer_horario,
            'semana_pasada': semana_horario,
            'promedio_historico': promedio_horario
        }
    }
