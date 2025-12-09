"""
Router para Configuración de Inventario ABC
Gestiona parámetros globales, niveles de servicio y configuración por tienda

Endpoints:
- GET  /api/config-inventario/parametros-abc       - Obtener configuración completa
- PUT  /api/config-inventario/parametros-abc/globales - Guardar parámetros globales
- PUT  /api/config-inventario/parametros-abc/niveles  - Guardar niveles de servicio
- PUT  /api/config-inventario/parametros-abc/tienda/{tienda_id} - Configuración por tienda
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional, Any
from pydantic import BaseModel
import logging

from db_manager import get_db_connection, get_db_connection_write

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/config-inventario", tags=["Configuración Inventario"])


# =====================================================================================
# MODELOS
# =====================================================================================

class ParametrosGlobales(BaseModel):
    lead_time: float = 1.5
    ventana_sigma_d: int = 30


class NivelServicioClase(BaseModel):
    clase: str  # A, B, C
    z_score: float
    nivel_servicio_pct: int
    dias_cobertura_max: int
    metodo: str  # 'estadistico' o 'padre_prudente'


class NivelesServicioRequest(BaseModel):
    niveles: List[NivelServicioClase]


class ConfigTienda(BaseModel):
    tienda_id: str
    tienda_nombre: str
    lead_time_override: Optional[float] = None
    dias_cobertura_a: Optional[int] = None
    dias_cobertura_b: Optional[int] = None
    dias_cobertura_c: Optional[int] = None
    activo: bool = True


class ConfiguracionABCCompleta(BaseModel):
    globales: ParametrosGlobales
    niveles_servicio: List[NivelServicioClase]
    config_tiendas: List[ConfigTienda]


# =====================================================================================
# VALORES POR DEFECTO (sincronizados con frontend y calculo_inventario_abc.py)
# =====================================================================================

DEFAULTS_GLOBALES = ParametrosGlobales(
    lead_time=1.5,
    ventana_sigma_d=30
)

DEFAULTS_NIVELES = [
    NivelServicioClase(
        clase='A',
        z_score=2.33,
        nivel_servicio_pct=99,
        dias_cobertura_max=7,
        metodo='estadistico'
    ),
    NivelServicioClase(
        clase='B',
        z_score=1.88,
        nivel_servicio_pct=97,
        dias_cobertura_max=14,
        metodo='estadistico'
    ),
    NivelServicioClase(
        clase='C',
        z_score=0,
        nivel_servicio_pct=0,
        dias_cobertura_max=30,
        metodo='padre_prudente'
    ),
]


def get_db():
    """Get database connection (read-only)"""
    with get_db_connection() as conn:
        yield conn


def get_db_write():
    """Get database connection (read-write)"""
    with get_db_connection_write() as conn:
        yield conn


# =====================================================================================
# GET - Obtener configuración completa
# =====================================================================================

@router.get("/parametros-abc", response_model=ConfiguracionABCCompleta)
async def obtener_configuracion_abc(conn: Any = Depends(get_db)):
    """
    Obtiene la configuración completa del modelo ABC:
    - Parámetros globales (Lead Time, Ventana σD)
    - Niveles de servicio por clase (A, B, C)
    - Configuración override por tienda
    """
    globales = DEFAULTS_GLOBALES.model_copy()
    niveles_servicio = list(DEFAULTS_NIVELES)
    config_tiendas = []

    # 1. Obtener parámetros globales
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT clave, valor_numerico
            FROM configuracion_sistema
            WHERE modulo = 'inventario_abc' AND activo = true
        """)
        rows = cursor.fetchall()
        cursor.close()
        for row in rows:
            if row[0] == 'lead_time' and row[1]:
                globales.lead_time = float(row[1])
            elif row[0] == 'ventana_sigma_d' and row[1]:
                globales.ventana_sigma_d = int(row[1])
    except Exception as e:
        logger.warning(f"Tabla configuracion_sistema no existe, usando defaults: {e}")
        conn.rollback()  # Limpiar transacción abortada

    # 2. Obtener niveles de servicio por clase
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT
                clasificacion as clase,
                COALESCE(factor_seguridad, 1.0) as z_score,
                dias_cobertura_max
            FROM parametros_clasificacion
            WHERE activo = true
            ORDER BY clasificacion
        """)
        rows = cursor.fetchall()
        cursor.close()
        if rows:
            niveles_dict = {}
            for row in rows:
                clase = row[0]
                if clase in ('A', 'B', 'C'):
                    dias_max = int(row[2]) if row[2] else 30

                    # Determinar nivel de servicio y método según clase
                    if clase == 'A':
                        nivel_pct = 99
                        z = 2.33
                        metodo = 'estadistico'
                    elif clase == 'B':
                        nivel_pct = 97
                        z = 1.88
                        metodo = 'estadistico'
                    else:  # C
                        nivel_pct = 0
                        z = 0
                        metodo = 'padre_prudente'

                    niveles_dict[clase] = NivelServicioClase(
                        clase=clase,
                        z_score=z,
                        nivel_servicio_pct=nivel_pct,
                        dias_cobertura_max=dias_max,
                        metodo=metodo
                    )

            if niveles_dict:
                niveles_servicio = [
                    niveles_dict.get('A', DEFAULTS_NIVELES[0]),
                    niveles_dict.get('B', DEFAULTS_NIVELES[1]),
                    niveles_dict.get('C', DEFAULTS_NIVELES[2]),
                ]
    except Exception as e:
        logger.warning(f"Error cargando parametros_clasificacion: {e}")
        conn.rollback()  # Limpiar transacción abortada

    # 3. Obtener configuración por tienda
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT
                ct.tienda_id,
                u.nombre as tienda_nombre,
                ct.lead_time_override,
                ct.dias_cobertura_a,
                ct.dias_cobertura_b,
                ct.dias_cobertura_c,
                ct.activo
            FROM config_parametros_abc_tienda ct
            LEFT JOIN ubicaciones u ON ct.tienda_id = u.id
            WHERE ct.activo = true
            ORDER BY u.nombre
        """)
        rows = cursor.fetchall()
        cursor.close()
        for row in rows:
            config_tiendas.append(ConfigTienda(
                tienda_id=row[0],
                tienda_nombre=row[1] or row[0],
                lead_time_override=float(row[2]) if row[2] else None,
                dias_cobertura_a=int(row[3]) if row[3] else None,
                dias_cobertura_b=int(row[4]) if row[4] else None,
                dias_cobertura_c=int(row[5]) if row[5] else None,
                activo=bool(row[6]) if row[6] is not None else True
            ))
    except Exception as e:
        logger.error(f"Error cargando config_parametros_abc_tienda: {e}")

    return ConfiguracionABCCompleta(
        globales=globales,
        niveles_servicio=niveles_servicio,
        config_tiendas=config_tiendas
    )


# =====================================================================================
# PUT - Guardar parámetros globales
# =====================================================================================

@router.put("/parametros-abc/globales")
async def guardar_parametros_globales(
    params: ParametrosGlobales,
    conn: Any = Depends(get_db_write)
):
    """
    Guarda los parámetros globales del modelo ABC:
    - Lead Time (días)
    - Ventana σD (días para calcular desviación estándar)
    """
    try:
        cursor = conn.cursor()

        # Verificar si existe la tabla configuracion_sistema
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = 'configuracion_sistema'
            )
        """)
        table_exists = cursor.fetchone()[0]

        if not table_exists:
            # Crear tabla si no existe
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS configuracion_sistema (
                    id SERIAL PRIMARY KEY,
                    modulo VARCHAR(50) NOT NULL,
                    clave VARCHAR(50) NOT NULL,
                    valor_numerico DECIMAL(10,4),
                    valor_texto VARCHAR(255),
                    activo BOOLEAN DEFAULT TRUE,
                    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    fecha_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(modulo, clave)
                )
            """)

        # Upsert lead_time
        cursor.execute("""
            INSERT INTO configuracion_sistema (modulo, clave, valor_numerico, fecha_modificacion)
            VALUES ('inventario_abc', 'lead_time', %s, CURRENT_TIMESTAMP)
            ON CONFLICT (modulo, clave)
            DO UPDATE SET valor_numerico = EXCLUDED.valor_numerico,
                          fecha_modificacion = CURRENT_TIMESTAMP
        """, [params.lead_time])

        # Upsert ventana_sigma_d
        cursor.execute("""
            INSERT INTO configuracion_sistema (modulo, clave, valor_numerico, fecha_modificacion)
            VALUES ('inventario_abc', 'ventana_sigma_d', %s, CURRENT_TIMESTAMP)
            ON CONFLICT (modulo, clave)
            DO UPDATE SET valor_numerico = EXCLUDED.valor_numerico,
                          fecha_modificacion = CURRENT_TIMESTAMP
        """, [params.ventana_sigma_d])

        conn.commit()
        cursor.close()

        logger.info(f"✅ Parámetros globales guardados: LT={params.lead_time}, σD={params.ventana_sigma_d}")

        return {
            "success": True,
            "mensaje": "Parámetros globales guardados correctamente",
            "parametros": params.model_dump()
        }

    except Exception as e:
        conn.rollback()
        logger.error(f"Error guardando parámetros globales: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error guardando parámetros: {str(e)}")


# =====================================================================================
# PUT - Guardar niveles de servicio
# =====================================================================================

@router.put("/parametros-abc/niveles")
async def guardar_niveles_servicio(
    request: NivelesServicioRequest,
    conn: Any = Depends(get_db_write)
):
    """
    Guarda los niveles de servicio por clase ABC:
    - Z-score (factor de seguridad estadístico)
    - Días de cobertura máximo
    - Método de cálculo (estadístico o padre prudente)
    """
    try:
        cursor = conn.cursor()

        for nivel in request.niveles:
            # Actualizar en parametros_clasificacion si existe
            cursor.execute("""
                UPDATE parametros_clasificacion
                SET
                    factor_seguridad = %s,
                    dias_cobertura_max = %s,
                    fecha_actualizacion = CURRENT_TIMESTAMP
                WHERE clasificacion = %s AND activo = true
            """, [
                nivel.z_score,
                nivel.dias_cobertura_max,
                nivel.clase
            ])

        conn.commit()
        cursor.close()

        logger.info(f"✅ Niveles de servicio guardados: {len(request.niveles)} clases")

        return {
            "success": True,
            "mensaje": "Niveles de servicio guardados correctamente",
            "niveles_actualizados": len(request.niveles)
        }

    except Exception as e:
        conn.rollback()
        logger.error(f"Error guardando niveles de servicio: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error guardando niveles: {str(e)}")


# =====================================================================================
# PUT - Guardar configuración por tienda
# =====================================================================================

@router.put("/parametros-abc/tienda/{tienda_id}")
async def guardar_config_tienda(
    tienda_id: str,
    config: ConfigTienda,
    conn: Any = Depends(get_db_write)
):
    """
    Guarda la configuración override para una tienda específica:
    - Lead Time override
    - Días de cobertura por clase (A, B, C)
    """
    try:
        cursor = conn.cursor()

        # Verificar si existe la tabla
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = 'config_parametros_abc_tienda'
            )
        """)
        table_exists = cursor.fetchone()[0]

        if not table_exists:
            # Crear tabla si no existe
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS config_parametros_abc_tienda (
                    id SERIAL PRIMARY KEY,
                    tienda_id VARCHAR(50) NOT NULL UNIQUE,
                    lead_time_override DECIMAL(5,2),
                    dias_cobertura_a INTEGER,
                    dias_cobertura_b INTEGER,
                    dias_cobertura_c INTEGER,
                    activo BOOLEAN DEFAULT TRUE,
                    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    fecha_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

        # Upsert configuración de tienda (id = tienda_id para simplicidad)
        cursor.execute("""
            INSERT INTO config_parametros_abc_tienda (
                id, tienda_id, lead_time_override,
                dias_cobertura_a, dias_cobertura_b, dias_cobertura_c,
                activo, fecha_creacion, fecha_modificacion
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (tienda_id)
            DO UPDATE SET
                lead_time_override = EXCLUDED.lead_time_override,
                dias_cobertura_a = EXCLUDED.dias_cobertura_a,
                dias_cobertura_b = EXCLUDED.dias_cobertura_b,
                dias_cobertura_c = EXCLUDED.dias_cobertura_c,
                activo = EXCLUDED.activo,
                fecha_modificacion = CURRENT_TIMESTAMP
        """, [
            tienda_id,  # usar tienda_id como id
            tienda_id,
            config.lead_time_override,
            config.dias_cobertura_a,
            config.dias_cobertura_b,
            config.dias_cobertura_c,
            config.activo
        ])

        conn.commit()
        cursor.close()

        logger.info(f"✅ Configuración guardada para tienda {tienda_id}")

        return {
            "success": True,
            "mensaje": f"Configuración de tienda {config.tienda_nombre} guardada correctamente",
            "tienda_id": tienda_id
        }

    except Exception as e:
        conn.rollback()
        logger.error(f"Error guardando configuración de tienda: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error guardando configuración: {str(e)}")


# =====================================================================================
# DELETE - Eliminar configuración de tienda
# =====================================================================================

@router.delete("/parametros-abc/tienda/{tienda_id}")
async def eliminar_config_tienda(
    tienda_id: str,
    conn: Any = Depends(get_db_write)
):
    """
    Elimina (desactiva) la configuración override de una tienda.
    La tienda usará los valores globales.
    """
    try:
        cursor = conn.cursor()

        cursor.execute("""
            UPDATE config_parametros_abc_tienda
            SET activo = false, fecha_modificacion = CURRENT_TIMESTAMP
            WHERE tienda_id = %s
        """, [tienda_id])

        rows_affected = cursor.rowcount
        conn.commit()
        cursor.close()

        if rows_affected == 0:
            raise HTTPException(status_code=404, detail="Configuración de tienda no encontrada")

        logger.info(f"✅ Configuración de tienda {tienda_id} desactivada")

        return {
            "success": True,
            "mensaje": f"Configuración de tienda eliminada. Usará valores globales.",
            "tienda_id": tienda_id
        }

    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        logger.error(f"Error eliminando configuración de tienda: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error eliminando configuración: {str(e)}")
