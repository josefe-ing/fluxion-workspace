"""
Modulo de calculo de parametros de inventario por clasificacion ABC.
Version ajustada para La Granja Mercado.

Caracteristicas:
- Lead time fijo: 1.5 dias
- Pedidos diarios
- Despacho solo en bultos completos
- Usa P75 como base de demanda
- Incluye sanity checks
- Generadores de Trafico se tratan como Clase A
"""
import math
from dataclasses import dataclass, field
from typing import List, Optional
from enum import Enum


# Constantes operativas La Granja (valores por defecto)
LEAD_TIME_DEFAULT = 1.5  # dias (fijo, CEDI cercano)
VENTANA_SIGMA_D = 30  # dias para calcular desviacion estandar

# Variable global para lead time (puede ser sobrescrita por config de tienda)
LEAD_TIME = LEAD_TIME_DEFAULT


class MetodoCalculo(Enum):
    ESTADISTICO = "estadistico"
    PADRE_PRUDENTE = "padre_prudente"


@dataclass
class ParametrosABC:
    nivel_servicio_z: float
    dias_cobertura: int
    metodo: MetodoCalculo


@dataclass
class InputCalculo:
    """Datos de entrada para el calculo de inventario."""
    demanda_p75: float          # P75 de ventas diarias (unidades)
    sigma_demanda: float        # sigmaD sobre ultimos 30 dias
    demanda_maxima: float       # D_max en un dia
    unidades_por_bulto: int     # Unidades por bulto del producto
    stock_actual: float         # Stock actual en tienda (unidades)
    stock_cedi: float           # Stock disponible en CEDI (unidades)
    clase_abc: str              # A, B, o C
    es_generador_trafico: bool  # Si es generador de trafico -> tratar como A


@dataclass
class ResultadoCalculo:
    """Resultado del calculo de parametros de inventario."""
    # Valores en UNIDADES (para calculos)
    stock_minimo_unid: float
    stock_seguridad_unid: float
    stock_maximo_unid: float
    punto_reorden_unid: float
    cantidad_sugerida_unid: float

    # Valores en BULTOS (para operacion)
    stock_minimo_bultos: int
    stock_seguridad_bultos: int
    stock_maximo_bultos: int
    punto_reorden_bultos: int
    cantidad_sugerida_bultos: int

    # Metadata
    metodo_usado: str
    clase_efectiva: str         # Clase usada para calculo (puede diferir de ABC real)
    demanda_ciclo: float
    dias_cobertura_actual: float

    # Sobrestock
    tiene_sobrestock: bool
    exceso_unidades: float
    exceso_bultos: int
    dias_exceso: float

    # Warnings de sanity checks
    warnings: List[str] = field(default_factory=list)


# Parametros por clase (niveles de servicio ajustados) - VALORES POR DEFECTO
# Clasificacion ABC por ranking de cantidad vendida:
#   A: Top 1-50       (Estadistico, 99% servicio)
#   B: Top 51-200     (Estadistico, 97% servicio)
#   C: Top 201-800    (Estadistico, 90% servicio)
#   D: Top 801+       (Padre Prudente)
PARAMS_ABC_DEFAULT = {
    'A': ParametrosABC(nivel_servicio_z=2.33, dias_cobertura=7, metodo=MetodoCalculo.ESTADISTICO),   # 99%
    'B': ParametrosABC(nivel_servicio_z=1.88, dias_cobertura=14, metodo=MetodoCalculo.ESTADISTICO),  # 97%
    'C': ParametrosABC(nivel_servicio_z=1.28, dias_cobertura=21, metodo=MetodoCalculo.ESTADISTICO),  # 90%
    'D': ParametrosABC(nivel_servicio_z=0.0, dias_cobertura=30, metodo=MetodoCalculo.PADRE_PRUDENTE),
}

# Parametros activos (pueden ser sobrescritos por config de tienda)
PARAMS_ABC = PARAMS_ABC_DEFAULT.copy()


@dataclass
class ConfigTiendaABC:
    """Configuración de parámetros ABC específica para una tienda."""
    lead_time: float = LEAD_TIME_DEFAULT
    dias_cobertura_a: int = 7
    dias_cobertura_b: int = 14
    dias_cobertura_c: int = 21
    dias_cobertura_d: int = 30


def set_config_tienda(config: Optional[ConfigTiendaABC] = None):
    """
    Configura los parámetros ABC para una tienda específica.
    Si config es None, restaura los valores por defecto.
    """
    global LEAD_TIME, PARAMS_ABC

    if config is None:
        # Restaurar defaults
        LEAD_TIME = LEAD_TIME_DEFAULT
        PARAMS_ABC = PARAMS_ABC_DEFAULT.copy()
    else:
        # Aplicar config de tienda
        LEAD_TIME = config.lead_time
        PARAMS_ABC = {
            'A': ParametrosABC(
                nivel_servicio_z=2.33,
                dias_cobertura=config.dias_cobertura_a,
                metodo=MetodoCalculo.ESTADISTICO
            ),
            'B': ParametrosABC(
                nivel_servicio_z=1.88,
                dias_cobertura=config.dias_cobertura_b,
                metodo=MetodoCalculo.ESTADISTICO
            ),
            'C': ParametrosABC(
                nivel_servicio_z=1.28,
                dias_cobertura=config.dias_cobertura_c,
                metodo=MetodoCalculo.ESTADISTICO
            ),
            'D': ParametrosABC(
                nivel_servicio_z=0.0,
                dias_cobertura=config.dias_cobertura_d,
                metodo=MetodoCalculo.PADRE_PRUDENTE
            ),
        }


def _redondear_a_bultos(cantidad_unid: float, unidades_bulto: int, debug_codigo: str = None) -> int:
    """
    Redondea cantidad sugerida a bultos completos hacia arriba.

    Si hay que pedir, siempre ceil. Sin excepciones.
    """
    if cantidad_unid <= 0:
        return 0

    resultado = math.ceil(cantidad_unid / unidades_bulto)

    # DEBUG temporal
    if debug_codigo or (cantidad_unid > 0 and resultado == 0):
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"🔧 _redondear_a_bultos: unid={cantidad_unid}, u/b={unidades_bulto}, division={cantidad_unid/unidades_bulto}, ceil={resultado}")

    return resultado


def _calcular_sobrestock(stock_actual: float, stock_maximo: float,
                         demanda_p75: float, unidades_por_bulto: int) -> dict:
    """
    Calcula indicadores de sobrestock (complementa criticidad existente).
    """
    exceso = stock_actual - stock_maximo

    if exceso <= 0:
        return {
            'tiene_sobrestock': False,
            'exceso_unidades': 0.0,
            'exceso_bultos': 0,
            'dias_exceso': 0.0
        }

    return {
        'tiene_sobrestock': True,
        'exceso_unidades': exceso,
        'exceso_bultos': math.ceil(exceso / unidades_por_bulto),
        'dias_exceso': exceso / demanda_p75 if demanda_p75 > 0 else 999.0
    }


def _ejecutar_sanity_checks(resultado: 'ResultadoCalculo', input_data: InputCalculo,
                             demanda_p75: float) -> List[str]:
    """Ejecuta todas las validaciones de cordura."""
    warnings = []

    # 1. Stock minimo no puede ser menor a 1 dia de venta
    if demanda_p75 > 0 and resultado.stock_minimo_unid < demanda_p75:
        warnings.append(f"WARN: Stock minimo ({resultado.stock_minimo_unid:.0f}) < 1 dia de venta")

    # 2. Stock maximo debe ser mayor que minimo
    if resultado.stock_maximo_unid <= resultado.stock_minimo_unid:
        warnings.append("ERROR: Stock maximo <= minimo")

    # 3. Stock de seguridad no negativo
    if resultado.stock_seguridad_unid < 0:
        warnings.append("WARN: Stock seguridad negativo")

    # 4. Cantidad sugerida vs stock CEDI (desactivado - datos CEDI no confiables)
    # if resultado.cantidad_sugerida_unid > input_data.stock_cedi:
    #     warnings.append(f"WARN: Sugerido ({resultado.cantidad_sugerida_unid:.0f}) > stock CEDI ({input_data.stock_cedi:.0f})")

    # 5. Validar rangos por clase
    if demanda_p75 > 0:
        dias_max = resultado.stock_maximo_unid / demanda_p75
        limites = {'A': 15, 'B': 30, 'C': 45, 'D': 60}
        limite = limites.get(resultado.clase_efectiva, 30)
        if dias_max > limite:
            warnings.append(f"WARN: Clase {resultado.clase_efectiva} con {dias_max:.0f} dias cobertura (limite: {limite})")

    # 6. sigmaD no deberia ser > 2x la demanda (CV muy alto)
    if input_data.sigma_demanda > input_data.demanda_p75 * 2 and input_data.demanda_p75 > 0:
        warnings.append(f"WARN: sigmaD muy alta ({input_data.sigma_demanda:.1f}) vs P75 ({input_data.demanda_p75:.1f})")

    return warnings


def _crear_resultado(stock_minimo_unid: float, stock_seguridad_unid: float,
                     stock_maximo_unid: float, punto_reorden_unid: float,
                     cantidad_sugerida_unid: float, unidades_bulto: int,
                     metodo: str, clase_efectiva: str, demanda_ciclo: float,
                     demanda_p75: float, input_data: InputCalculo) -> ResultadoCalculo:
    """Crea resultado con conversion a bultos y sanity checks."""

    # Redondear a bultos (ceil para garantizar cobertura)
    stock_minimo_bultos = math.ceil(stock_minimo_unid / unidades_bulto) if unidades_bulto > 0 else 0
    stock_seguridad_bultos = math.ceil(stock_seguridad_unid / unidades_bulto) if unidades_bulto > 0 else 0
    stock_maximo_bultos = math.ceil(stock_maximo_unid / unidades_bulto) if unidades_bulto > 0 else 0
    punto_reorden_bultos = math.ceil(punto_reorden_unid / unidades_bulto) if unidades_bulto > 0 else 0

    # Cantidad sugerida: siempre redondear hacia arriba
    cantidad_bultos = _redondear_a_bultos(cantidad_sugerida_unid, unidades_bulto)
    cantidad_unid_final = cantidad_bultos * unidades_bulto

    # Dias de cobertura actual
    dias_cobertura = (input_data.stock_actual + cantidad_unid_final) / demanda_p75 if demanda_p75 > 0 else 999.0

    # Calcular sobrestock
    sobrestock = _calcular_sobrestock(
        input_data.stock_actual,
        stock_maximo_unid,
        demanda_p75,
        unidades_bulto
    )

    resultado = ResultadoCalculo(
        stock_minimo_unid=stock_minimo_unid,
        stock_seguridad_unid=stock_seguridad_unid,
        stock_maximo_unid=stock_maximo_unid,
        punto_reorden_unid=punto_reorden_unid,
        cantidad_sugerida_unid=cantidad_unid_final,
        stock_minimo_bultos=stock_minimo_bultos,
        stock_seguridad_bultos=stock_seguridad_bultos,
        stock_maximo_bultos=stock_maximo_bultos,
        punto_reorden_bultos=punto_reorden_bultos,
        cantidad_sugerida_bultos=cantidad_bultos,
        metodo_usado=metodo,
        clase_efectiva=clase_efectiva,
        demanda_ciclo=demanda_ciclo,
        dias_cobertura_actual=dias_cobertura,
        tiene_sobrestock=sobrestock['tiene_sobrestock'],
        exceso_unidades=sobrestock['exceso_unidades'],
        exceso_bultos=sobrestock['exceso_bultos'],
        dias_exceso=sobrestock['dias_exceso'],
        warnings=[]
    )

    # Ejecutar sanity checks
    resultado.warnings = _ejecutar_sanity_checks(resultado, input_data, demanda_p75)

    return resultado


def calcular_estadistico(input_data: InputCalculo, params: ParametrosABC,
                         clase_efectiva: str) -> ResultadoCalculo:
    """
    Clases A, B y C: Formula estadistica simplificada (sin sigmaL porque L es fijo).

    SS = Z * sigmaD * sqrt(L)
    ROP = (D_P75 * L) + SS
    Max = ROP + (D_P75 * dias_cobertura)

    NOTA: Para tiendas nuevas con sigma_D = 0 (sin variabilidad calculable),
    usamos un SS mínimo conservador del 30% de la demanda durante lead time.
    """
    Z = params.nivel_servicio_z
    D = input_data.demanda_p75
    L = LEAD_TIME
    sigma_D = input_data.sigma_demanda
    unidades_bulto = input_data.unidades_por_bulto

    # Stock de seguridad
    # Si sigma_D = 0 (tienda nueva, pocos datos), usar SS mínimo conservador
    if sigma_D > 0:
        stock_seguridad = Z * sigma_D * math.sqrt(L)
    else:
        # SS mínimo: 30% de demanda durante lead time (conservador para tiendas nuevas)
        stock_seguridad = 0.30 * D * L

    # Demanda durante lead time
    demanda_ciclo = D * L

    # Punto de reorden (Minimo)
    punto_reorden = demanda_ciclo + stock_seguridad

    # Maximo
    stock_maximo = punto_reorden + (D * params.dias_cobertura)

    # Cantidad a pedir: SOLO si stock_actual <= ROP (punto de reorden)
    # Si stock está entre ROP y MAX (nivel óptimo), NO sugerir pedido
    if input_data.stock_actual <= punto_reorden:
        # Pedir hasta llegar al máximo
        cantidad_sugerida = max(0, stock_maximo - input_data.stock_actual)
    else:
        # Stock en nivel óptimo o exceso - no pedir
        cantidad_sugerida = 0

    return _crear_resultado(
        stock_minimo_unid=punto_reorden,
        stock_seguridad_unid=stock_seguridad,
        stock_maximo_unid=stock_maximo,
        punto_reorden_unid=punto_reorden,
        cantidad_sugerida_unid=cantidad_sugerida,
        unidades_bulto=unidades_bulto,
        metodo="estadistico",
        clase_efectiva=clase_efectiva,
        demanda_ciclo=demanda_ciclo,
        demanda_p75=D,
        input_data=input_data
    )


def calcular_padre_prudente(input_data: InputCalculo, params: ParametrosABC,
                            clase_efectiva: str) -> ResultadoCalculo:
    """
    Clase D: Metodo heuristico "Padre Prudente".

    Min = D_max * L (peor escenario)
    Max = Min + (D_P75 * dias_cobertura)

    NOTA: Para tiendas nuevas donde D_max = D_P75 (un solo dato),
    usamos un SS mínimo del 20% de la demanda durante lead time.
    """
    D = input_data.demanda_p75
    D_max = input_data.demanda_maxima
    L = LEAD_TIME
    unidades_bulto = input_data.unidades_por_bulto

    # Demanda durante lead time (para referencia)
    demanda_ciclo = D * L

    # Stock de seguridad implicito (diferencia entre D_max y D_P75 durante lead time)
    stock_seguridad_calculado = max(0, (D_max * L) - demanda_ciclo)

    # Si SS = 0 (tienda nueva, D_max = D_P75), usar SS mínimo conservador
    if stock_seguridad_calculado > 0:
        stock_seguridad = stock_seguridad_calculado
    else:
        # SS mínimo: 20% de demanda durante lead time (menos agresivo que clase A/B)
        stock_seguridad = 0.20 * demanda_ciclo

    # Punto de reorden usando demanda_ciclo + stock_seguridad
    punto_reorden = demanda_ciclo + stock_seguridad

    # Maximo
    stock_maximo = punto_reorden + (D * params.dias_cobertura)

    # Cantidad a pedir: SOLO si stock_actual <= ROP (punto de reorden)
    # Si stock está entre ROP y MAX (nivel óptimo), NO sugerir pedido
    if input_data.stock_actual <= punto_reorden:
        # Pedir hasta llegar al máximo
        cantidad_sugerida = max(0, stock_maximo - input_data.stock_actual)
    else:
        # Stock en nivel óptimo o exceso - no pedir
        cantidad_sugerida = 0

    return _crear_resultado(
        stock_minimo_unid=punto_reorden,
        stock_seguridad_unid=stock_seguridad,
        stock_maximo_unid=stock_maximo,
        punto_reorden_unid=punto_reorden,
        cantidad_sugerida_unid=cantidad_sugerida,
        unidades_bulto=unidades_bulto,
        metodo="padre_prudente",
        clase_efectiva=clase_efectiva,
        demanda_ciclo=demanda_ciclo,
        demanda_p75=D,
        input_data=input_data
    )


def calcular_inventario(input_data: InputCalculo, dias_cobertura_override: Optional[int] = None) -> ResultadoCalculo:
    """
    Funcion principal: calcula parametros de inventario segun clase ABC.

    IMPORTANTE: Los Generadores de Trafico siempre se tratan como Clase A,
    independientemente de su clasificacion ABC real.

    Args:
        input_data: Datos de entrada para el cálculo
        dias_cobertura_override: Si se especifica, sobrescribe los días de cobertura
                                  de la clase ABC. Útil para categorías perecederas.
    """
    # Determinar clase efectiva
    if input_data.es_generador_trafico:
        clase_efectiva = 'A'  # Forzar tratamiento clase A para generadores
    else:
        clase_efectiva = input_data.clase_abc

    params = PARAMS_ABC.get(clase_efectiva, PARAMS_ABC['B'])

    # Si hay override de días de cobertura (por categoría perecedera), crear nuevos params
    if dias_cobertura_override is not None:
        params = ParametrosABC(
            nivel_servicio_z=params.nivel_servicio_z,
            dias_cobertura=dias_cobertura_override,
            metodo=params.metodo
        )

    if params.metodo == MetodoCalculo.PADRE_PRUDENTE:
        return calcular_padre_prudente(input_data, params, clase_efectiva)
    else:
        return calcular_estadistico(input_data, params, clase_efectiva)


def calcular_inventario_simple(
    demanda_p75: float,
    sigma_demanda: float,
    demanda_maxima: float,
    unidades_por_bulto: int,
    stock_actual: float,
    stock_cedi: float,
    clase_abc: str,
    es_generador_trafico: bool = False,
    dias_cobertura_override: Optional[int] = None
) -> ResultadoCalculo:
    """
    Wrapper simple para calcular inventario sin crear InputCalculo manualmente.

    Util para integracion con el endpoint existente.

    Args:
        dias_cobertura_override: Si se especifica, usa este valor de días de cobertura
                                  en lugar del configurado para la clase ABC.
                                  Útil para categorías perecederas (FRUVER, CARNICERIA, etc.)
    """
    input_data = InputCalculo(
        demanda_p75=demanda_p75,
        sigma_demanda=sigma_demanda,
        demanda_maxima=demanda_maxima,
        unidades_por_bulto=unidades_por_bulto,
        stock_actual=stock_actual,
        stock_cedi=stock_cedi,
        clase_abc=clase_abc,
        es_generador_trafico=es_generador_trafico
    )
    return calcular_inventario(input_data, dias_cobertura_override=dias_cobertura_override)
