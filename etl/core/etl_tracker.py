#!/usr/bin/env python3
"""
ETL Execution Tracker - Sistema de tracking y recuperación de fallos
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
    from loader import DuckDBLoader
    from config import ETLConfig
except ImportError:
    from core.loader import DuckDBLoader
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

    Funcionalidades:
    - Registra inicio/fin de ejecuciones
    - Detecta gaps (ejecuciones fallidas sin recuperar)
    - Proporciona información para recuperación automática
    - Calcula métricas de confiabilidad
    """

    def __init__(self, version_etl: str = "2.0"):
        self.loader = DuckDBLoader()
        self.logger = self._setup_logger()
        self.version_etl = version_etl
        self.hostname = socket.gethostname()

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

        conn = self.loader.get_connection()

        try:
            # Insertar ejecución
            result = conn.execute("""
                INSERT INTO etl_ejecuciones (
                    etl_tipo, ubicacion_id, ubicacion_nombre,
                    fecha_inicio, fecha_desde, fecha_hasta,
                    hora_desde, hora_hasta,
                    estado, modo, version_etl, host
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING id
            """, [
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
            ]).fetchone()

            ejecucion_id = result[0]
            ejecucion.id = ejecucion_id

            self.logger.info(f"📝 Ejecución iniciada: ID={ejecucion_id}, tipo={ejecucion.etl_tipo}, "
                           f"ubicacion={ejecucion.ubicacion_id}, modo={ejecucion.modo}")

            return ejecucion_id

        finally:
            conn.close()

    def finalizar_ejecucion_exitosa(
        self,
        ejecucion_id: int,
        registros_extraidos: int,
        registros_cargados: int
    ):
        """Marca una ejecución como exitosa"""
        fecha_fin = datetime.now()

        conn = self.loader.get_connection()

        try:
            # Obtener fecha_inicio para calcular duración
            result = conn.execute("""
                SELECT fecha_inicio
                FROM etl_ejecuciones
                WHERE id = ?
            """, [ejecucion_id]).fetchone()

            if not result:
                self.logger.error(f"❌ Ejecución {ejecucion_id} no encontrada")
                return

            fecha_inicio = result[0]
            duracion = (fecha_fin - fecha_inicio).total_seconds()

            # Actualizar ejecución
            conn.execute("""
                UPDATE etl_ejecuciones
                SET estado = 'exitoso',
                    fecha_fin = ?,
                    duracion_segundos = ?,
                    registros_extraidos = ?,
                    registros_cargados = ?
                WHERE id = ?
            """, [fecha_fin, duracion, registros_extraidos, registros_cargados, ejecucion_id])

            self.logger.info(f"✅ Ejecución {ejecucion_id} finalizada exitosamente: "
                           f"{registros_cargados:,} registros en {duracion:.2f}s")

        finally:
            conn.close()

    def finalizar_ejecucion_fallida(
        self,
        ejecucion_id: int,
        error_mensaje: str,
        error_tipo: str = 'unknown',
        registros_extraidos: int = 0
    ):
        """Marca una ejecución como fallida"""
        fecha_fin = datetime.now()

        conn = self.loader.get_connection()

        try:
            # Obtener fecha_inicio para calcular duración
            result = conn.execute("""
                SELECT fecha_inicio
                FROM etl_ejecuciones
                WHERE id = ?
            """, [ejecucion_id]).fetchone()

            if not result:
                self.logger.error(f"❌ Ejecución {ejecucion_id} no encontrada")
                return

            fecha_inicio = result[0]
            duracion = (fecha_fin - fecha_inicio).total_seconds()

            # Actualizar ejecución
            conn.execute("""
                UPDATE etl_ejecuciones
                SET estado = 'fallido',
                    fecha_fin = ?,
                    duracion_segundos = ?,
                    registros_extraidos = ?,
                    error_mensaje = ?,
                    error_tipo = ?
                WHERE id = ?
            """, [fecha_fin, duracion, registros_extraidos, error_mensaje, error_tipo, ejecucion_id])

            self.logger.error(f"❌ Ejecución {ejecucion_id} falló: {error_tipo} - {error_mensaje[:100]}")

        finally:
            conn.close()

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
        conn = self.loader.get_connection()

        try:
            query = """
                SELECT
                    etl_tipo,
                    ubicacion_id,
                    ubicacion_nombre,
                    fecha_desde,
                    fecha_hasta,
                    hora_desde,
                    hora_hasta,
                    fecha_fallo,
                    error_tipo,
                    error_mensaje,
                    horas_desde_fallo
                FROM v_gaps_por_recuperar
                WHERE horas_desde_fallo <= ?
            """

            params = [max_horas]

            if etl_tipo:
                query += " AND etl_tipo = ?"
                params.append(etl_tipo)

            if ubicacion_id:
                query += " AND ubicacion_id = ?"
                params.append(ubicacion_id)

            query += " ORDER BY fecha_fallo ASC"

            results = conn.execute(query, params).fetchall()

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
                    horas_desde_fallo=row[10]
                )
                gaps.append(gap)

            if gaps:
                self.logger.info(f"🔍 Encontrados {len(gaps)} gaps por recuperar")

            return gaps

        finally:
            conn.close()

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
        conn = self.loader.get_connection()

        try:
            query = """
                SELECT
                    etl_tipo,
                    ubicacion_id,
                    ubicacion_nombre,
                    fecha,
                    total_ejecuciones,
                    ejecuciones_exitosas,
                    ejecuciones_fallidas,
                    tasa_exito_pct,
                    duracion_promedio_seg,
                    total_registros_cargados
                FROM v_metricas_confiabilidad
                WHERE fecha >= CURRENT_DATE - INTERVAL '? days'
            """

            params = []

            if etl_tipo:
                query += " AND etl_tipo = ?"
                params.append(etl_tipo)

            query += " ORDER BY fecha DESC, ubicacion_id"

            # Reemplazar el placeholder manualmente (DuckDB no soporta ? en INTERVAL)
            query = query.replace('? days', f'{dias} days')

            results = conn.execute(query, params).fetchall()

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
                    'tasa_exito_pct': row[7],
                    'duracion_promedio_seg': row[8],
                    'total_registros_cargados': row[9]
                })

            return metricas

        finally:
            conn.close()

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
    print("TEST: ETL Tracker")
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
