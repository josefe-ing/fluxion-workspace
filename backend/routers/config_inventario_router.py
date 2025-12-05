"""
Router para gestionar configuración de inventario
"""

from fastapi import APIRouter, HTTPException
from typing import List, Optional
import uuid
from pydantic import BaseModel
from db_manager import get_db_connection, get_db_connection_write, is_postgres_mode
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/config-inventario", tags=["Configuración Inventario"])


# ===== MODELS =====

class ConfigGlobalItem(BaseModel):
    id: str
    categoria: str
    parametro: str
    valor_numerico: Optional[float]
    valor_texto: Optional[str]
    descripcion: str
    unidad: str
    activo: bool


class ConfigGlobalUpdate(BaseModel):
    valor_numerico: Optional[float]
    valor_texto: Optional[str]


class ConfigTienda(BaseModel):
    id: str
    tienda_id: str
    tienda_nombre: Optional[str]
    categoria_producto: str
    clasificacion_abc: str
    stock_min_multiplicador: float
    stock_seg_multiplicador: float
    stock_max_multiplicador: float
    lead_time_dias: int
    activo: bool


class ConfigTiendaUpdate(BaseModel):
    stock_min_multiplicador: Optional[float]
    stock_seg_multiplicador: Optional[float]
    stock_max_multiplicador: Optional[float]
    lead_time_dias: Optional[int]


class ConfigProducto(BaseModel):
    id: str
    codigo_producto: str
    descripcion_producto: Optional[str]
    tienda_id: str
    tienda_nombre: Optional[str]
    categoria_producto: str
    stock_min_multiplicador: float
    stock_seg_multiplicador: float
    stock_max_multiplicador: float
    lead_time_dias: int
    dias_vida_util: Optional[int]
    umbral_merma_pct: Optional[float]
    activo: bool


# ===== ENDPOINTS =====

@router.get("/global", response_model=List[ConfigGlobalItem])
async def get_config_global():
    """Obtiene toda la configuración global"""
    try:
        with get_db_connection() as conn:
            query = """
                SELECT
                    id, categoria, parametro, valor_numerico, valor_texto,
                    descripcion, unidad, activo
                FROM config_inventario_global
                WHERE activo = true
                ORDER BY categoria, parametro
            """
            result = conn.execute(query).fetchall()

            items = []
            for row in result:
                items.append(ConfigGlobalItem(
                    id=row[0],
                    categoria=row[1],
                    parametro=row[2],
                    valor_numerico=float(row[3]) if row[3] is not None else None,
                    valor_texto=row[4],
                    descripcion=row[5],
                    unidad=row[6],
                    activo=row[7]
                ))

            return items
    except Exception as e:
        logger.error(f"Error obteniendo config global: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/global/{config_id}")
async def update_config_global(config_id: str, update: ConfigGlobalUpdate):
    """Actualiza un parámetro de configuración global"""
    try:
        with get_db_connection_write() as conn:
            conn.execute("""
                UPDATE config_inventario_global
                SET valor_numerico = ?,
                    valor_texto = ?,
                    fecha_modificacion = CURRENT_TIMESTAMP
                WHERE id = ?
            """, [update.valor_numerico, update.valor_texto, config_id])
            conn.commit()

            return {"success": True, "message": "Configuración actualizada"}
    except Exception as e:
        logger.error(f"Error actualizando config global: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tienda", response_model=List[ConfigTienda])
async def get_config_tienda(
    tienda_id: str,
    categoria: Optional[str] = None
):
    """Obtiene configuración por tienda y categoría"""
    try:
        with get_db_connection() as conn:
            # Base query
            query = """
                SELECT
                    ct.id, ct.tienda_id,
                    COALESCE(u.ubicacion_nombre, ct.tienda_id) as tienda_nombre,
                    ct.categoria_producto, ct.clasificacion_abc,
                    ct.stock_min_multiplicador, ct.stock_seg_multiplicador,
                    ct.stock_max_multiplicador, ct.lead_time_dias, ct.activo
                FROM config_inventario_tienda ct
                LEFT JOIN (
                    SELECT DISTINCT ubicacion_id, ubicacion_nombre
                    FROM inventario_raw
                ) u ON ct.tienda_id = u.ubicacion_id
                WHERE ct.tienda_id = ? AND ct.activo = true
            """

            params = [tienda_id]

            if categoria:
                query += " AND ct.categoria_producto = ?"
                params.append(categoria)

            query += " ORDER BY ct.categoria_producto, ct.clasificacion_abc"

            result = conn.execute(query, params).fetchall()

            configs = []
            for row in result:
                configs.append(ConfigTienda(
                    id=row[0],
                    tienda_id=row[1],
                    tienda_nombre=row[2],
                    categoria_producto=row[3],
                    clasificacion_abc=row[4],
                    stock_min_multiplicador=float(row[5]),
                    stock_seg_multiplicador=float(row[6]),
                    stock_max_multiplicador=float(row[7]),
                    lead_time_dias=int(row[8]),
                    activo=row[9]
                ))

            return configs
    except Exception as e:
        logger.error(f"Error obteniendo config tienda: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/tienda/{config_id}")
async def update_config_tienda(config_id: str, update: ConfigTiendaUpdate):
    """Actualiza configuración de una tienda"""
    try:
        with get_db_connection_write() as conn:
            # Build update query dynamically
            updates = []
            params = []

            if update.stock_min_multiplicador is not None:
                updates.append("stock_min_multiplicador = ?")
                params.append(update.stock_min_multiplicador)
            if update.stock_seg_multiplicador is not None:
                updates.append("stock_seg_multiplicador = ?")
                params.append(update.stock_seg_multiplicador)
            if update.stock_max_multiplicador is not None:
                updates.append("stock_max_multiplicador = ?")
                params.append(update.stock_max_multiplicador)
            if update.lead_time_dias is not None:
                updates.append("lead_time_dias = ?")
                params.append(update.lead_time_dias)

            if not updates:
                raise HTTPException(status_code=400, detail="No fields to update")

            updates.append("fecha_modificacion = CURRENT_TIMESTAMP")
            params.append(config_id)

            query = f"""
                UPDATE config_inventario_tienda
                SET {', '.join(updates)}
                WHERE id = ?
            """

            conn.execute(query, params)
            conn.commit()

            return {"success": True, "message": "Configuración actualizada"}
    except Exception as e:
        logger.error(f"Error actualizando config tienda: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/productos", response_model=List[ConfigProducto])
async def get_config_productos(
    tienda_id: str,
    categoria: Optional[str] = None
):
    """Obtiene configuración individual de productos"""
    try:
        with get_db_connection() as conn:
            query = """
                SELECT
                    cp.id, cp.codigo_producto,
                    COALESCE(p.descripcion, cp.codigo_producto) as descripcion_producto,
                    cp.tienda_id,
                    COALESCE(u.ubicacion_nombre, cp.tienda_id) as tienda_nombre,
                    cp.categoria_producto,
                    cp.stock_min_multiplicador, cp.stock_seg_multiplicador,
                    cp.stock_max_multiplicador, cp.lead_time_dias,
                    cp.dias_vida_util, cp.umbral_merma_pct, cp.activo
                FROM config_inventario_producto cp
                LEFT JOIN (
                    SELECT DISTINCT codigo, descripcion
                    FROM productos_ubicacion_completa
                ) p ON cp.codigo_producto = p.codigo
                LEFT JOIN (
                    SELECT DISTINCT ubicacion_id, ubicacion_nombre
                    FROM inventario_raw
                ) u ON cp.tienda_id = u.ubicacion_id
                WHERE cp.tienda_id = ? AND cp.activo = true
            """

            params = [tienda_id]

            if categoria:
                query += " AND cp.categoria_producto = ?"
                params.append(categoria)

            query += " ORDER BY cp.codigo_producto"

            result = conn.execute(query, params).fetchall()

            configs = []
            for row in result:
                configs.append(ConfigProducto(
                    id=row[0],
                    codigo_producto=row[1],
                    descripcion_producto=row[2],
                    tienda_id=row[3],
                    tienda_nombre=row[4],
                    categoria_producto=row[5],
                    stock_min_multiplicador=float(row[6]),
                    stock_seg_multiplicador=float(row[7]),
                    stock_max_multiplicador=float(row[8]),
                    lead_time_dias=int(row[9]),
                    dias_vida_util=int(row[10]) if row[10] else None,
                    umbral_merma_pct=float(row[11]) if row[11] else None,
                    activo=row[12]
                ))

            return configs
    except Exception as e:
        logger.error(f"Error obteniendo config productos: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/productos/{config_id}")
async def delete_config_producto(config_id: str):
    """Elimina (desactiva) configuración de un producto"""
    try:
        with get_db_connection_write() as conn:
            conn.execute("""
                UPDATE config_inventario_producto
                SET activo = false,
                    fecha_modificacion = CURRENT_TIMESTAMP
                WHERE id = ?
            """, [config_id])
            conn.commit()

            return {"success": True, "message": "Configuración eliminada"}
    except Exception as e:
        logger.error(f"Error eliminando config producto: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ===== NUEVOS ENDPOINTS: PARÁMETROS ABC =====

class ParametrosGlobales(BaseModel):
    lead_time: float
    ventana_sigma_d: int


class NivelServicioClase(BaseModel):
    clase: str
    z_score: float
    nivel_servicio_pct: int
    dias_cobertura_max: int
    metodo: str


class NivelesServicioUpdate(BaseModel):
    niveles: List[NivelServicioClase]


class ConfigTiendaABC(BaseModel):
    tienda_id: str
    tienda_nombre: str
    lead_time_override: Optional[float]
    dias_cobertura_a: Optional[int]
    dias_cobertura_b: Optional[int]
    dias_cobertura_c: Optional[int]
    activo: bool


# Valores por defecto hardcodeados (los mismos que en calculo_inventario_abc.py)
DEFAULTS_ABC = {
    'lead_time': 1.5,
    'ventana_sigma_d': 30,
    'clases': [
        {'clase': 'A', 'z_score': 2.33, 'nivel_servicio_pct': 99, 'dias_cobertura_max': 7, 'metodo': 'estadistico'},
        {'clase': 'B', 'z_score': 1.88, 'nivel_servicio_pct': 97, 'dias_cobertura_max': 14, 'metodo': 'estadistico'},
        {'clase': 'C', 'z_score': 0, 'nivel_servicio_pct': 0, 'dias_cobertura_max': 30, 'metodo': 'padre_prudente'},
    ]
}


@router.get("/parametros-abc")
async def get_parametros_abc():
    """
    Obtiene todos los parámetros del modelo ABC:
    - Parámetros globales (lead_time, ventana_sigma_d)
    - Niveles de servicio por clase
    - Configuración por tienda (overrides)
    """
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()

            # 1. Obtener parámetros globales desde config_inventario_global
            globales = {
                'lead_time': DEFAULTS_ABC['lead_time'],
                'ventana_sigma_d': DEFAULTS_ABC['ventana_sigma_d'],
            }

            try:
                cursor.execute("""
                    SELECT parametro, valor_numerico
                    FROM config_inventario_global
                    WHERE categoria = 'parametros_abc'
                      AND activo = true
                """)
                result = cursor.fetchall()

                for row in result:
                    if row[0] == 'lead_time' and row[1] is not None:
                        globales['lead_time'] = float(row[1])
                    elif row[0] == 'ventana_sigma_d' and row[1] is not None:
                        globales['ventana_sigma_d'] = int(row[1])
            except Exception as e:
                logger.warning(f"No se encontró tabla config_inventario_global: {e}")

            # 2. Obtener niveles de servicio
            niveles_servicio = []

            try:
                cursor.execute("""
                    SELECT parametro, valor_numerico
                    FROM config_inventario_global
                    WHERE categoria = 'niveles_servicio'
                      AND activo = true
                """)
                result = cursor.fetchall()

                # Mapear z-scores a clases
                zscores = {}
                for row in result:
                    zscores[row[0]] = float(row[1]) if row[1] else 0

                # Obtener días de cobertura
                cursor.execute("""
                    SELECT parametro, valor_numerico
                    FROM config_inventario_global
                    WHERE categoria = 'dias_cobertura_abc'
                      AND activo = true
                """)
                result_dias = cursor.fetchall()

                dias_cobertura = {}
                for row in result_dias:
                    dias_cobertura[row[0]] = int(row[1]) if row[1] else None

                # Construir niveles
                for default in DEFAULTS_ABC['clases']:
                    clase = default['clase']
                    z_key = f'zscore_{clase.lower()}'
                    dias_key = f'dias_cobertura_{clase.lower()}'

                    niveles_servicio.append({
                        'clase': clase,
                        'z_score': zscores.get(z_key, default['z_score']),
                        'nivel_servicio_pct': default['nivel_servicio_pct'],
                        'dias_cobertura_max': dias_cobertura.get(dias_key, default['dias_cobertura_max']),
                        'metodo': default['metodo'],
                    })

            except Exception as e:
                logger.warning(f"Usando defaults para niveles de servicio: {e}")
                niveles_servicio = DEFAULTS_ABC['clases']

            # 3. Obtener configuración por tienda
            config_tiendas = []

            try:
                cursor.execute("""
                    SELECT
                        ct.tienda_id,
                        COALESCE(u.nombre, ct.tienda_id) as tienda_nombre,
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
                result = cursor.fetchall()

                for row in result:
                    config_tiendas.append({
                        'tienda_id': row[0],
                        'tienda_nombre': row[1],
                        'lead_time_override': float(row[2]) if row[2] is not None else None,
                        'dias_cobertura_a': int(row[3]) if row[3] is not None else None,
                        'dias_cobertura_b': int(row[4]) if row[4] is not None else None,
                        'dias_cobertura_c': int(row[5]) if row[5] is not None else None,
                        'activo': row[6],
                    })
            except Exception as e:
                logger.warning(f"No se encontró tabla config_parametros_abc_tienda: {e}")

            cursor.close()
            return {
                'globales': globales,
                'niveles_servicio': niveles_servicio,
                'config_tiendas': config_tiendas,
            }

    except Exception as e:
        logger.error(f"Error obteniendo parámetros ABC: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/parametros-abc/globales")
async def update_parametros_globales(params: ParametrosGlobales):
    """Actualiza los parámetros globales del modelo ABC"""
    try:
        with get_db_connection_write() as conn:
            cursor = conn.cursor()

            # Upsert lead_time
            cursor.execute("""
                INSERT INTO config_inventario_global
                (id, categoria, parametro, valor_numerico, descripcion, unidad, activo)
                VALUES (%s, 'parametros_abc', 'lead_time', %s, 'Lead Time (días)', 'días', true)
                ON CONFLICT (categoria, parametro)
                DO UPDATE SET valor_numerico = EXCLUDED.valor_numerico,
                              fecha_modificacion = CURRENT_TIMESTAMP
            """, (str(uuid.uuid4()), params.lead_time))

            # Upsert ventana_sigma_d
            cursor.execute("""
                INSERT INTO config_inventario_global
                (id, categoria, parametro, valor_numerico, descripcion, unidad, activo)
                VALUES (%s, 'parametros_abc', 'ventana_sigma_d', %s, 'Ventana para σD', 'días', true)
                ON CONFLICT (categoria, parametro)
                DO UPDATE SET valor_numerico = EXCLUDED.valor_numerico,
                              fecha_modificacion = CURRENT_TIMESTAMP
            """, (str(uuid.uuid4()), params.ventana_sigma_d))

            conn.commit()
            cursor.close()
            return {"success": True, "message": "Parámetros globales actualizados"}

    except Exception as e:
        logger.error(f"Error actualizando parámetros globales: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/parametros-abc/niveles")
async def update_niveles_servicio(update: NivelesServicioUpdate):
    """Actualiza los niveles de servicio por clase ABC"""
    try:
        with get_db_connection_write() as conn:
            cursor = conn.cursor()

            for nivel in update.niveles:
                clase = nivel.clase.lower()

                # Upsert z-score
                z_param = f'zscore_{clase}'
                cursor.execute("""
                    INSERT INTO config_inventario_global
                    (id, categoria, parametro, valor_numerico, descripcion, unidad, activo)
                    VALUES (%s, 'niveles_servicio', %s, %s, %s, 'zscore', true)
                    ON CONFLICT (categoria, parametro)
                    DO UPDATE SET valor_numerico = EXCLUDED.valor_numerico,
                                  fecha_modificacion = CURRENT_TIMESTAMP
                """, (str(uuid.uuid4()), z_param, nivel.z_score, f'Z-score para clase {nivel.clase}'))

                # Upsert días de cobertura
                dias_param = f'dias_cobertura_{clase}'
                cursor.execute("""
                    INSERT INTO config_inventario_global
                    (id, categoria, parametro, valor_numerico, descripcion, unidad, activo)
                    VALUES (%s, 'dias_cobertura_abc', %s, %s, %s, 'días', true)
                    ON CONFLICT (categoria, parametro)
                    DO UPDATE SET valor_numerico = EXCLUDED.valor_numerico,
                                  fecha_modificacion = CURRENT_TIMESTAMP
                """, (str(uuid.uuid4()), dias_param, nivel.dias_cobertura_max, f'Días cobertura máx clase {nivel.clase}'))

            conn.commit()
            cursor.close()
            return {"success": True, "message": "Niveles de servicio actualizados"}

    except Exception as e:
        logger.error(f"Error actualizando niveles de servicio: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/parametros-abc/tienda/{tienda_id}")
async def update_config_tienda_abc(tienda_id: str, config: ConfigTiendaABC):
    """Actualiza o crea configuración ABC para una tienda específica"""
    try:
        with get_db_connection_write() as conn:
            cursor = conn.cursor()

            # Crear tabla si no existe
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS config_parametros_abc_tienda (
                    id VARCHAR(50) PRIMARY KEY,
                    tienda_id VARCHAR(50) NOT NULL UNIQUE,
                    lead_time_override FLOAT,
                    dias_cobertura_a INTEGER,
                    dias_cobertura_b INTEGER,
                    dias_cobertura_c INTEGER,
                    activo BOOLEAN DEFAULT true,
                    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    fecha_modificacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # Upsert configuración de tienda
            cursor.execute("""
                INSERT INTO config_parametros_abc_tienda
                (id, tienda_id, lead_time_override, dias_cobertura_a, dias_cobertura_b, dias_cobertura_c, activo)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (tienda_id)
                DO UPDATE SET lead_time_override = EXCLUDED.lead_time_override,
                              dias_cobertura_a = EXCLUDED.dias_cobertura_a,
                              dias_cobertura_b = EXCLUDED.dias_cobertura_b,
                              dias_cobertura_c = EXCLUDED.dias_cobertura_c,
                              activo = EXCLUDED.activo,
                              fecha_modificacion = CURRENT_TIMESTAMP
            """, (
                str(uuid.uuid4()),
                tienda_id,
                config.lead_time_override,
                config.dias_cobertura_a,
                config.dias_cobertura_b,
                config.dias_cobertura_c,
                config.activo
            ))

            conn.commit()
            cursor.close()
            return {"success": True, "message": f"Configuración de tienda {tienda_id} guardada"}

    except Exception as e:
        logger.error(f"Error actualizando config tienda ABC: {e}")
        raise HTTPException(status_code=500, detail=str(e))
