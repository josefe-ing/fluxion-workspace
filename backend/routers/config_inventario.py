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
    clase: str  # A, B, C, D
    z_score: float
    nivel_servicio_pct: int
    dias_cobertura_max: int
    metodo: str  # 'estadistico' o 'padre_prudente'


class UmbralesABC(BaseModel):
    umbral_a: int = 50    # Top 1-50 = A
    umbral_b: int = 200   # Top 51-200 = B
    umbral_c: int = 800   # Top 201-800 = C, 801+ = D


class NivelesServicioRequest(BaseModel):
    niveles: List[NivelServicioClase]


class ConfigTienda(BaseModel):
    tienda_id: str
    tienda_nombre: str
    lead_time_override: Optional[float] = None
    dias_cobertura_a: Optional[int] = None
    dias_cobertura_b: Optional[int] = None
    dias_cobertura_c: Optional[int] = None
    dias_cobertura_d: Optional[int] = None
    activo: bool = True


class ConfiguracionABCCompleta(BaseModel):
    globales: ParametrosGlobales
    niveles_servicio: List[NivelServicioClase]
    config_tiendas: List[ConfigTienda]
    umbrales: UmbralesABC


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
        z_score=1.28,
        nivel_servicio_pct=90,
        dias_cobertura_max=21,
        metodo='estadistico'
    ),
    NivelServicioClase(
        clase='D',
        z_score=0,
        nivel_servicio_pct=0,
        dias_cobertura_max=30,
        metodo='padre_prudente'
    ),
]

DEFAULTS_UMBRALES = UmbralesABC(
    umbral_a=50,
    umbral_b=200,
    umbral_c=800
)


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
    - Niveles de servicio por clase (A, B, C, D)
    - Umbrales de ranking para clasificación
    - Configuración override por tienda
    """
    globales = DEFAULTS_GLOBALES.model_copy()
    niveles_servicio = list(DEFAULTS_NIVELES)
    config_tiendas = []
    umbrales = DEFAULTS_UMBRALES.model_copy()

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
                if clase in ('A', 'B', 'C', 'D'):
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
                    elif clase == 'C':
                        nivel_pct = 90
                        z = 1.28
                        metodo = 'estadistico'
                    else:  # D
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
                    niveles_dict.get('D', DEFAULTS_NIVELES[3]),
                ]
    except Exception as e:
        logger.warning(f"Error cargando parametros_clasificacion: {e}")
        conn.rollback()  # Limpiar transacción abortada

    # 2.5. Obtener umbrales de ranking desde config_inventario_global
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, valor_numerico
            FROM config_inventario_global
            WHERE categoria = 'abc_umbrales_ranking' AND activo = true
        """)
        rows = cursor.fetchall()
        cursor.close()
        for row in rows:
            if row[0] == 'abc_umbral_a' and row[1]:
                umbrales.umbral_a = int(row[1])
            elif row[0] == 'abc_umbral_b' and row[1]:
                umbrales.umbral_b = int(row[1])
            elif row[0] == 'abc_umbral_c' and row[1]:
                umbrales.umbral_c = int(row[1])
    except Exception as e:
        logger.warning(f"Error cargando umbrales ABC: {e}")
        conn.rollback()

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
                ct.clase_d_dias_cobertura,
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
                dias_cobertura_d=int(row[6]) if row[6] else None,
                activo=bool(row[7]) if row[7] is not None else True
            ))
    except Exception as e:
        logger.error(f"Error cargando config_parametros_abc_tienda: {e}")

    return ConfiguracionABCCompleta(
        globales=globales,
        niveles_servicio=niveles_servicio,
        config_tiendas=config_tiendas,
        umbrales=umbrales
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
# PUT - Guardar umbrales de clasificación ABC
# =====================================================================================

@router.put("/parametros-abc/umbrales")
async def guardar_umbrales_abc(
    umbrales: UmbralesABC,
    conn: Any = Depends(get_db_write)
):
    """
    Guarda los umbrales de ranking para clasificación ABC:
    - umbral_a: Top N productos para clase A (ej: 50 = ranking 1-50)
    - umbral_b: Top N productos para clase B (ej: 200 = ranking 51-200)
    - umbral_c: Top N productos para clase C (ej: 800 = ranking 201-800)
    - Clase D: todos los productos con ranking > umbral_c
    """
    try:
        cursor = conn.cursor()

        # Validar que los umbrales sean coherentes
        if not (umbrales.umbral_a < umbrales.umbral_b < umbrales.umbral_c):
            raise HTTPException(
                status_code=400,
                detail="Los umbrales deben ser: umbral_a < umbral_b < umbral_c"
            )

        # Actualizar umbrales en config_inventario_global
        for umbral_id, valor in [
            ('abc_umbral_a', umbrales.umbral_a),
            ('abc_umbral_b', umbrales.umbral_b),
            ('abc_umbral_c', umbrales.umbral_c),
        ]:
            cursor.execute("""
                INSERT INTO config_inventario_global (id, categoria, parametro, valor_numerico, descripcion, unidad, activo, fecha_modificacion)
                VALUES (%s, 'abc_umbrales_ranking', %s, %s, %s, 'ranking', true, CURRENT_TIMESTAMP)
                ON CONFLICT (id)
                DO UPDATE SET
                    valor_numerico = EXCLUDED.valor_numerico,
                    fecha_modificacion = CURRENT_TIMESTAMP
            """, [
                umbral_id,
                umbral_id.replace('abc_', ''),  # parametro: umbral_a, umbral_b, umbral_c
                valor,
                f'Top {valor} productos' if umbral_id == 'abc_umbral_a' else f'Ranking hasta {valor}'
            ])

        conn.commit()
        cursor.close()

        logger.info(f"✅ Umbrales ABC guardados: A≤{umbrales.umbral_a}, B≤{umbrales.umbral_b}, C≤{umbrales.umbral_c}")

        return {
            "success": True,
            "mensaje": "Umbrales de clasificación guardados correctamente",
            "umbrales": umbrales.model_dump(),
            "descripcion": {
                "A": f"Ranking 1-{umbrales.umbral_a}",
                "B": f"Ranking {umbrales.umbral_a + 1}-{umbrales.umbral_b}",
                "C": f"Ranking {umbrales.umbral_b + 1}-{umbrales.umbral_c}",
                "D": f"Ranking {umbrales.umbral_c + 1}+"
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        logger.error(f"Error guardando umbrales ABC: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error guardando umbrales: {str(e)}")


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
    - Días de cobertura por clase (A, B, C, D)
    """
    try:
        cursor = conn.cursor()

        # Upsert configuración de tienda
        cursor.execute("""
            INSERT INTO config_parametros_abc_tienda (
                tienda_id, lead_time_override,
                dias_cobertura_a, dias_cobertura_b, dias_cobertura_c, clase_d_dias_cobertura,
                activo, fecha_creacion, fecha_modificacion
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            ON CONFLICT (tienda_id)
            DO UPDATE SET
                lead_time_override = EXCLUDED.lead_time_override,
                dias_cobertura_a = EXCLUDED.dias_cobertura_a,
                dias_cobertura_b = EXCLUDED.dias_cobertura_b,
                dias_cobertura_c = EXCLUDED.dias_cobertura_c,
                clase_d_dias_cobertura = EXCLUDED.clase_d_dias_cobertura,
                activo = EXCLUDED.activo,
                fecha_modificacion = CURRENT_TIMESTAMP
        """, [
            tienda_id,
            config.lead_time_override,
            config.dias_cobertura_a,
            config.dias_cobertura_b,
            config.dias_cobertura_c,
            config.dias_cobertura_d,
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
