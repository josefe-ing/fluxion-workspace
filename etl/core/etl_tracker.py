#!/usr/bin/env python3
"""
ETL Execution Tracker - Sistema de tracking y recuperación de fallos
PostgreSQL only - DuckDB removed (Dec 2025)

Registra ejecuciones de ETL y detecta gaps para recuperación automática

Autor: ETL Team
Fecha: 2025-11-24
"""

import socket
from datetime import datetime, date, time, timedelta
from typing import Optional, List, Dict, Tuple
from dataclasses import dataclass
import logging

try:
    from db_manager import get_postgres_connection
    from config import ETLConfig
except ImportError:
    from core.db_manager import get_postgres_connection
    from core.config import ETLConfig


@dataclass
class ETLEjecucion:
    """Representa una ejecución de ETL"""
    etl_tipo: str                    # 'inventario' o 'ventas'
    ubicacion_id: str
    ubicacion_nombre: str
    fecha_desde: date
    fecha_hasta: date
    hora_desde: Optional[time] = None
    hora_hasta: Optional[time] = None
    modo: str = 'completo'           # 'completo', 'incremental_30min', 'recuperacion'

    # Campos llenados automáticamente
    id: Optional[int] = None
    fecha_inicio: Optional[datetime] = None
    fecha_fin: Optional[datetime] = None
    duracion_segundos: Optional[float] = None
    estado: str = 'en_proceso'       # 'en_proceso', 'exitoso', 'fallido', 'parcial'
    registros_extraidos: int = 0
    registros_cargados: int = 0
    error_mensaje: Optional[str] = None
    error_tipo: Optional[str] = None  # 'timeout', 'conexion', 'api_error', 'db_error'
    version_etl: Optional[str] = None
    host: Optional[str] = None


@dataclass
class GapRecuperacion:
    """Representa un gap que necesita recuperación"""
    etl_tipo: str
    ubicacion_id: str
    ubicacion_nombre: str
    fecha_desde: date
    fecha_hasta: date
    hora_desde: Optional[time]
    hora_hasta: Optional[time]
    fecha_fallo: datetime
    error_tipo: Optional[str]
    error_mensaje: Optional[str]
    horas_desde_fallo: float


class ETLTracker:
    """
    Tracker de ejecuciones ETL con capacidad de recuperación de gaps
    PostgreSQL only - DuckDB removed (Dec 2025)

    Funcionalidades:
    - Registra inicio/fin de ejecuciones
    - Detecta gaps (ejecuciones fallidas sin recuperar)
    - Proporciona información para recuperación automática
    - Calcula métricas de confiabilidad
    """

    def __init__(self, version_etl: str = "2.0"):
        self.logger = self._setup_logger()
        self.version_etl = version_etl
        self.hostname = socket.gethostname()
        self._ensure_tables_exist()

    def _setup_logger(self) -> logging.Logger:
        """Configura el logger"""
        logger = logging.getLogger('etl_tracker')
        if not logger.handlers:
            logger.setLevel(logging.INFO)
            handler = logging.StreamHandler()
            formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
            handler.setFormatter(formatter)
            logger.addHandler(handler)
        return logger

    def _ensure_tables_exist(self):
        """Verifica que la tabla etl_ejecuciones existe en PostgreSQL"""
        try:
            with get_postgres_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables
                        WHERE table_name = 'etl_ejecuciones'
                    )
                """)
                exists = cursor.fetchone()[0]
                if not exists:
                    self.logger.warning("⚠️ Tabla etl_ejecuciones no existe - tracking deshabilitado")
                cursor.close()
        except Exception as e:
            self.logger.warning(f"⚠️ No se pudo verificar tabla etl_ejecuciones: {e}")

    def iniciar_ejecucion(self, ejecucion: ETLEjecucion) -> int:
        """
        Registra el inicio de una ejecución ETL

        Returns:
            ID de la ejecución creada
        """
        ejecucion.fecha_inicio = datetime.now()
        ejecucion.estado = 'en_proceso'
        ejecucion.version_etl = self.version_etl
        ejecucion.host = self.hostname

        try:
            with get_postgres_connection() as conn:
                cursor = conn.cursor()

                # Insertar ejecución
                cursor.execute("""
                    INSERT INTO etl_ejecuciones (
                        etl_tipo, ubicacion_id, ubicacion_nombre,
                        fecha_inicio, fecha_desde, fecha_hasta,
                        hora_desde, hora_hasta,
                        estado, modo, version_etl, host
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                """, (
                    ejecucion.etl_tipo,
                    ejecucion.ubicacion_id,
                    ejecucion.ubicacion_nombre,
                    ejecucion.fecha_inicio,
                    ejecucion.fecha_desde,
                    ejecucion.fecha_hasta,
                    str(ejecucion.hora_desde) if ejecucion.hora_desde else None,
                    str(ejecucion.hora_hasta) if ejecucion.hora_hasta else None,
                    ejecucion.estado,
                    ejecucion.modo,
                    ejecucion.version_etl,
                    ejecucion.host
                ))

                result = cursor.fetchone()
                ejecucion_id = result[0]
                ejecucion.id = ejecucion_id

                conn.commit()
                cursor.close()

                self.logger.info(f"📝 Ejecución iniciada: ID={ejecucion_id}, tipo={ejecucion.etl_tipo}, "
                               f"ubicacion={ejecucion.ubicacion_id}, modo={ejecucion.modo}")

                return ejecucion_id

        except Exception as e:
            self.logger.warning(f"⚠️ No se pudo registrar ejecución (tabla no existe?): {e}")
            return -1

    def finalizar_ejecucion_exitosa(
        self,
        ejecucion_id: int,
        registros_extraidos: int,
        registros_cargados: int
    ):
        """Marca una ejecución como exitosa"""
        if ejecucion_id < 0:
            return

        fecha_fin = datetime.now()

        try:
            with get_postgres_connection() as conn:
                cursor = conn.cursor()

                # Obtener fecha_inicio para calcular duración
                cursor.execute("""
                    SELECT fecha_inicio
                    FROM etl_ejecuciones
                    WHERE id = %s
                """, (ejecucion_id,))

                result = cursor.fetchone()
                if not result:
                    self.logger.error(f"❌ Ejecución {ejecucion_id} no encontrada")
                    return

                fecha_inicio = result[0]
                duracion = (fecha_fin - fecha_inicio).total_seconds()

                # Actualizar ejecución
                cursor.execute("""
                    UPDATE etl_ejecuciones
                    SET estado = 'exitoso',
                        fecha_fin = %s,
                        duracion_segundos = %s,
                        registros_extraidos = %s,
                        registros_cargados = %s
                    WHERE id = %s
                """, (fecha_fin, duracion, registros_extraidos, registros_cargados, ejecucion_id))

                conn.commit()
                cursor.close()

                self.logger.info(f"✅ Ejecución {ejecucion_id} finalizada exitosamente: "
                               f"{registros_cargados:,} registros en {duracion:.2f}s")

        except Exception as e:
            self.logger.warning(f"⚠️ No se pudo actualizar ejecución: {e}")

    def finalizar_ejecucion_fallida(
        self,
        ejecucion_id: int,
        error_mensaje: str,
        error_tipo: str = 'unknown',
        registros_extraidos: int = 0
    ):
        """Marca una ejecución como fallida"""
        if ejecucion_id < 0:
            return

        fecha_fin = datetime.now()

        try:
            with get_postgres_connection() as conn:
                cursor = conn.cursor()

                # Obtener fecha_inicio para calcular duración
                cursor.execute("""
                    SELECT fecha_inicio
                    FROM etl_ejecuciones
                    WHERE id = %s
                """, (ejecucion_id,))

                result = cursor.fetchone()
                if not result:
                    self.logger.error(f"❌ Ejecución {ejecucion_id} no encontrada")
                    return

                fecha_inicio = result[0]
                duracion = (fecha_fin - fecha_inicio).total_seconds()

                # Actualizar ejecución
                cursor.execute("""
                    UPDATE etl_ejecuciones
                    SET estado = 'fallido',
                        fecha_fin = %s,
                        duracion_segundos = %s,
                        registros_extraidos = %s,
                        error_mensaje = %s,
                        error_tipo = %s
                    WHERE id = %s
                """, (fecha_fin, duracion, registros_extraidos, error_mensaje, error_tipo, ejecucion_id))

                conn.commit()
                cursor.close()

                self.logger.error(f"❌ Ejecución {ejecucion_id} falló: {error_tipo} - {error_mensaje[:100]}")

        except Exception as e:
            self.logger.warning(f"⚠️ No se pudo actualizar ejecución fallida: {e}")

    def obtener_gaps_por_recuperar(
        self,
        etl_tipo: Optional[str] = None,
        ubicacion_id: Optional[str] = None,
        max_horas: int = 168  # 7 días por defecto
    ) -> List[GapRecuperacion]:
        """
        Obtiene gaps que necesitan recuperación

        Args:
            etl_tipo: Filtrar por tipo ('inventario' o 'ventas')
            ubicacion_id: Filtrar por ubicación
            max_horas: Máximo de horas atrás a buscar

        Returns:
            Lista de gaps que necesitan recuperación
        """
        try:
            with get_postgres_connection() as conn:
                cursor = conn.cursor()

                # Buscar ejecuciones fallidas que no tienen una exitosa posterior
                query = """
                    SELECT
                        e.etl_tipo,
                        e.ubicacion_id,
                        e.ubicacion_nombre,
                        e.fecha_desde,
                        e.fecha_hasta,
                        e.hora_desde,
                        e.hora_hasta,
                        e.fecha_inicio as fecha_fallo,
                        e.error_tipo,
                        e.error_mensaje,
                        EXTRACT(EPOCH FROM (NOW() - e.fecha_inicio)) / 3600 as horas_desde_fallo
                    FROM etl_ejecuciones e
                    WHERE e.estado = 'fallido'
                      AND e.fecha_inicio >= NOW() - INTERVAL '%s hours'
                      AND NOT EXISTS (
                          SELECT 1 FROM etl_ejecuciones e2
                          WHERE e2.etl_tipo = e.etl_tipo
                            AND e2.ubicacion_id = e.ubicacion_id
                            AND e2.fecha_desde = e.fecha_desde
                            AND e2.fecha_hasta = e.fecha_hasta
                            AND e2.estado = 'exitoso'
                            AND e2.fecha_inicio > e.fecha_inicio
                      )
                """

                params = [max_horas]

                if etl_tipo:
                    query += " AND e.etl_tipo = %s"
                    params.append(etl_tipo)

                if ubicacion_id:
                    query += " AND e.ubicacion_id = %s"
                    params.append(ubicacion_id)

                query += " ORDER BY e.fecha_inicio ASC"

                cursor.execute(query, params)
                results = cursor.fetchall()
                cursor.close()

                gaps = []
                for row in results:
                    gap = GapRecuperacion(
                        etl_tipo=row[0],
                        ubicacion_id=row[1],
                        ubicacion_nombre=row[2],
                        fecha_desde=row[3],
                        fecha_hasta=row[4],
                        hora_desde=row[5],
                        hora_hasta=row[6],
                        fecha_fallo=row[7],
                        error_tipo=row[8],
                        error_mensaje=row[9],
                        horas_desde_fallo=row[10] or 0
                    )
                    gaps.append(gap)

                if gaps:
                    self.logger.info(f"🔍 Encontrados {len(gaps)} gaps por recuperar")

                return gaps

        except Exception as e:
            self.logger.warning(f"⚠️ No se pudieron obtener gaps: {e}")
            return []

    def obtener_metricas_confiabilidad(
        self,
        dias: int = 7,
        etl_tipo: Optional[str] = None
    ) -> List[Dict]:
        """
        Obtiene métricas de confiabilidad de las ejecuciones

        Args:
            dias: Número de días atrás a analizar
            etl_tipo: Filtrar por tipo ('inventario' o 'ventas')

        Returns:
            Lista de métricas por tienda/día
        """
        try:
            with get_postgres_connection() as conn:
                cursor = conn.cursor()

                query = """
                    SELECT
                        etl_tipo,
                        ubicacion_id,
                        ubicacion_nombre,
                        DATE(fecha_inicio) as fecha,
                        COUNT(*) as total_ejecuciones,
                        SUM(CASE WHEN estado = 'exitoso' THEN 1 ELSE 0 END) as ejecuciones_exitosas,
                        SUM(CASE WHEN estado = 'fallido' THEN 1 ELSE 0 END) as ejecuciones_fallidas,
                        ROUND(100.0 * SUM(CASE WHEN estado = 'exitoso' THEN 1 ELSE 0 END) / COUNT(*), 2) as tasa_exito_pct,
                        ROUND(AVG(duracion_segundos)::numeric, 2) as duracion_promedio_seg,
                        SUM(registros_cargados) as total_registros_cargados
                    FROM etl_ejecuciones
                    WHERE fecha_inicio >= CURRENT_DATE - INTERVAL '%s days'
                """

                params = [dias]

                if etl_tipo:
                    query += " AND etl_tipo = %s"
                    params.append(etl_tipo)

                query += " GROUP BY etl_tipo, ubicacion_id, ubicacion_nombre, DATE(fecha_inicio)"
                query += " ORDER BY fecha DESC, ubicacion_id"

                cursor.execute(query, params)
                results = cursor.fetchall()
                cursor.close()

                metricas = []
                for row in results:
                    metricas.append({
                        'etl_tipo': row[0],
                        'ubicacion_id': row[1],
                        'ubicacion_nombre': row[2],
                        'fecha': row[3],
                        'total_ejecuciones': row[4],
                        'ejecuciones_exitosas': row[5],
                        'ejecuciones_fallidas': row[6],
                        'tasa_exito_pct': float(row[7]) if row[7] else 0,
                        'duracion_promedio_seg': float(row[8]) if row[8] else 0,
                        'total_registros_cargados': row[9] or 0
                    })

                return metricas

        except Exception as e:
            self.logger.warning(f"⚠️ No se pudieron obtener métricas: {e}")
            return []

    def recuperar_gaps_automaticamente(
        self,
        max_gaps: int = 10,
        callback_recuperacion = None
    ) -> Tuple[int, int]:
        """
        Intenta recuperar gaps automáticamente

        Args:
            max_gaps: Máximo número de gaps a recuperar en esta ejecución
            callback_recuperacion: Función callback que recibe (gap) y ejecuta la recuperación

        Returns:
            Tupla (gaps_recuperados, gaps_fallidos)
        """
        gaps = self.obtener_gaps_por_recuperar()

        if not gaps:
            self.logger.info("✅ No hay gaps por recuperar")
            return (0, 0)

        self.logger.info(f"🔧 Iniciando recuperación de {min(len(gaps), max_gaps)} gaps...")

        recuperados = 0
        fallidos = 0

        for i, gap in enumerate(gaps[:max_gaps]):
            self.logger.info(f"\n📋 Gap {i+1}/{min(len(gaps), max_gaps)}: "
                           f"{gap.etl_tipo} - {gap.ubicacion_nombre} - "
                           f"{gap.fecha_desde} {gap.hora_desde or ''}")

            if callback_recuperacion:
                try:
                    # Llamar al callback para ejecutar recuperación
                    exito = callback_recuperacion(gap)

                    if exito:
                        recuperados += 1
                        self.logger.info(f"✅ Gap recuperado exitosamente")
                    else:
                        fallidos += 1
                        self.logger.warning(f"⚠️ Gap no pudo ser recuperado")

                except Exception as e:
                    fallidos += 1
                    self.logger.error(f"❌ Error recuperando gap: {e}")
            else:
                self.logger.warning("⚠️ No se proporcionó callback de recuperación")
                break

        self.logger.info(f"\n📊 Recuperación completada: {recuperados} exitosos, {fallidos} fallidos")

        return (recuperados, fallidos)


def test_tracker():
    """Test básico del tracker"""
    print("\n" + "="*80)
    print("TEST: ETL Tracker (PostgreSQL)")
    print("="*80 + "\n")

    tracker = ETLTracker(version_etl="2.0-test")

    # Test 1: Crear ejecución exitosa
    print("📝 Test 1: Ejecución exitosa")
    ejecucion = ETLEjecucion(
        etl_tipo='ventas',
        ubicacion_id='tienda_01',
        ubicacion_nombre='PERIFERICO',
        fecha_desde=date.today(),
        fecha_hasta=date.today(),
        modo='incremental_30min'
    )

    ejecucion_id = tracker.iniciar_ejecucion(ejecucion)
    print(f"✅ Ejecución iniciada con ID: {ejecucion_id}")

    # Simular trabajo
    import time
    time.sleep(1)

    tracker.finalizar_ejecucion_exitosa(ejecucion_id, registros_extraidos=450, registros_cargados=450)
    print("✅ Ejecución finalizada como exitosa\n")

    # Test 2: Crear ejecución fallida
    print("📝 Test 2: Ejecución fallida")
    ejecucion2 = ETLEjecucion(
        etl_tipo='inventario',
        ubicacion_id='tienda_08',
        ubicacion_nombre='BOSQUE',
        fecha_desde=date.today(),
        fecha_hasta=date.today(),
        modo='completo'
    )

    ejecucion_id2 = tracker.iniciar_ejecucion(ejecucion2)
    tracker.finalizar_ejecucion_fallida(
        ejecucion_id2,
        error_mensaje="Connection timeout",
        error_tipo="timeout"
    )
    print("✅ Ejecución fallida registrada\n")

    # Test 3: Obtener gaps
    print("📝 Test 3: Buscar gaps")
    gaps = tracker.obtener_gaps_por_recuperar()
    print(f"✅ Gaps encontrados: {len(gaps)}")
    for gap in gaps[:3]:
        print(f"   - {gap.etl_tipo} / {gap.ubicacion_nombre} / {gap.fecha_desde} / {gap.error_tipo}")

    # Test 4: Métricas
    print("\n📝 Test 4: Métricas de confiabilidad")
    metricas = tracker.obtener_metricas_confiabilidad(dias=7)
    print(f"✅ Métricas obtenidas: {len(metricas)} registros")
    if metricas:
        m = metricas[0]
        print(f"   Ejemplo: {m['ubicacion_nombre']} - {m['fecha']} - "
              f"{m['tasa_exito_pct']}% éxito")

    print("\n" + "="*80)
    print("✅ Tests completados")
    print("="*80 + "\n")


if __name__ == "__main__":
    test_tracker()
