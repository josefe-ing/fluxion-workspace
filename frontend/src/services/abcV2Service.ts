/**
 * Servicio para clasificación ABC v2 basada en valor económico
 */

import http from './http';

export interface ClasificacionABCv2 {
  codigo_producto: string;
  clasificacion_abc_valor: string;
  ranking_valor: number;
  valor_consumo_total: number;
  porcentaje_valor: number;
  porcentaje_acumulado: number;
  unidades_vendidas_total: number;
  numero_ubicaciones: number;
  clasificacion_velocidad?: string;
  tiene_discrepancia: boolean;
  tipo_discrepancia?: string;
  // Campos XYZ (variabilidad de demanda)
  clasificacion_xyz?: string; // X, Y, Z
  matriz_abc_xyz?: string; // AX, AY, AZ, BX, BY, BZ, CX, CY, CZ
  coeficiente_variacion?: number;
  demanda_promedio_semanal?: number;
  desviacion_estandar_semanal?: number;
  semanas_con_venta?: number;
  confiabilidad_calculo?: string; // ALTA, MEDIA, BAJA
  es_extremadamente_volatil?: boolean;
}

export interface ResumenABCv2 {
  total_productos: number;
  productos_a: number;
  productos_b: number;
  productos_c: number;
  valor_total: number;
  porcentaje_valor_a: number;
  cumple_pareto: boolean;
  fecha_calculo: string;
}

/**
 * Obtener resumen general de ABC v2
 */
export async function getResumenABCv2(ubicacionId?: string): Promise<ResumenABCv2> {
  const params = new URLSearchParams();
  if (ubicacionId) params.append('ubicacion_id', ubicacionId);

  const response = await http.get(`/api/abc-v2/resumen?${params.toString()}`);
  return response.data;
}

/**
 * Obtener clasificación ABC v2 de un producto
 */
export async function getClasificacionProducto(codigoProducto: string, ubicacionId?: string): Promise<ClasificacionABCv2> {
  const params = new URLSearchParams();
  if (ubicacionId) params.append('ubicacion_id', ubicacionId);

  const response = await http.get(`/api/abc-v2/producto/${codigoProducto}?${params.toString()}`);
  return response.data;
}

/**
 * Obtener clasificaciones de múltiples productos
 */
export async function getClasificacionesProductos(
  codigos?: string,
  clasificacion?: string,
  ubicacionId?: string,
  limit: number = 100
): Promise<ClasificacionABCv2[]> {
  const params = new URLSearchParams();
  if (codigos) params.append('codigos', codigos);
  if (clasificacion) params.append('clasificacion', clasificacion);
  if (ubicacionId) params.append('ubicacion_id', ubicacionId);
  params.append('limit', limit.toString());

  const response = await http.get(`/api/abc-v2/productos?${params.toString()}`);
  return response.data;
}

/**
 * Obtener TOP N productos por valor
 */
export async function getTopProductos(n: number = 20): Promise<ClasificacionABCv2[]> {
  const response = await http.get(`/api/abc-v2/top/${n}`);
  return response.data;
}

/**
 * Obtener clasificaciones para una lista de códigos (helper)
 */
export async function getClasificacionesPorCodigos(
  codigos: string[],
  ubicacionId?: string
): Promise<Map<string, ClasificacionABCv2>> {
  if (codigos.length === 0) {
    return new Map();
  }

  const codigosStr = codigos.join(',');
  const clasificaciones = await getClasificacionesProductos(codigosStr, undefined, ubicacionId, codigos.length);

  const map = new Map<string, ClasificacionABCv2>();
  clasificaciones.forEach(c => map.set(c.codigo_producto, c));

  return map;
}

/**
 * Obtener color de la clasificación ABC v2
 * Colores fijos por clase (independientes del modelo activo)
 */
export function getColorClasificacionABCv2(clasificacion: string): string {
  switch (clasificacion) {
    case 'A':
      return 'text-green-700 bg-green-50 border-green-300';
    case 'B':
      return 'text-yellow-700 bg-yellow-50 border-yellow-300';
    case 'C':
      return 'text-orange-700 bg-orange-50 border-orange-300';
    case 'D':
      return 'text-purple-700 bg-purple-50 border-purple-300';
    case 'NUEVO':
      return 'text-blue-700 bg-blue-50 border-blue-300';
    case 'ERROR_COSTO':
      return 'text-red-700 bg-red-50 border-red-300';
    default:
      return 'text-gray-500 bg-gray-50 border-gray-300';
  }
}

/**
 * Obtener icono de discrepancia
 */
export function getIconoDiscrepancia(clasificacion: ClasificacionABCv2): string {
  if (!clasificacion.tiene_discrepancia) {
    return '✓'; // Coherente
  }

  if (clasificacion.tipo_discrepancia?.includes('bajo valor')) {
    return '⚠️'; // Alta velocidad, bajo valor
  }

  if (clasificacion.tipo_discrepancia?.includes('alto valor')) {
    return '🔥'; // Baja velocidad, alto valor (crítico)
  }

  return '~'; // Discrepancia moderada
}

/**
 * Obtener color de la clasificación XYZ
 */
export function getColorClasificacionXYZ(clasificacion: string): string {
  switch (clasificacion) {
    case 'X':
      return 'text-green-700 bg-green-50 border-green-300';
    case 'Y':
      return 'text-yellow-700 bg-yellow-50 border-yellow-300';
    case 'Z':
      return 'text-red-700 bg-red-50 border-red-300';
    default:
      return 'text-gray-500 bg-gray-50 border-gray-300';
  }
}

/**
 * Obtener color de la matriz ABC-XYZ
 */
export function getColorMatrizABCXYZ(matriz: string): string {
  // Productos críticos (alta rotación + errático)
  if (matriz === 'AZ') {
    return 'text-red-900 bg-red-100 border-red-400 font-bold';
  }

  // Productos ideales (alta rotación + estable)
  if (matriz === 'AX') {
    return 'text-green-800 bg-green-100 border-green-400 font-semibold';
  }

  // Combinaciones A (clase más alta)
  if (matriz?.startsWith('A')) {
    return 'text-green-700 bg-green-50 border-green-300';
  }

  // Combinaciones B (clase media-alta)
  if (matriz?.startsWith('B')) {
    return 'text-yellow-700 bg-yellow-50 border-yellow-300';
  }

  // Combinaciones C (clase media-baja)
  if (matriz?.startsWith('C')) {
    return 'text-orange-700 bg-orange-50 border-orange-300';
  }

  // Combinaciones D (clase más baja)
  if (matriz?.startsWith('D')) {
    return 'text-purple-700 bg-purple-50 border-purple-300';
  }

  return 'text-gray-500 bg-gray-50 border-gray-300';
}

/**
 * Obtener descripción de la clasificación XYZ
 */
export function getDescripcionXYZ(clasificacion: string): string {
  switch (clasificacion) {
    case 'X':
      return 'Demanda estable y predecible (CV < 0.5)';
    case 'Y':
      return 'Demanda variable con tendencia (0.5 ≤ CV < 1.0)';
    case 'Z':
      return 'Demanda errática e impredecible (CV ≥ 1.0)';
    default:
      return 'Sin clasificación';
  }
}

/**
 * Obtener estrategia recomendada por matriz ABC-XYZ
 */
export function getEstrategiaMatriz(matriz: string): string {
  const estrategias: Record<string, string> = {
    'AX': 'Stock alto, reposición automática',
    'AY': 'Monitoreo semanal, stock medio',
    'AZ': '🔥 CRÍTICO - Atención especial, alertas',
    'BX': 'Stock medio, reposición programada',
    'BY': 'Monitoreo quincenal',
    'BZ': 'Stock bajo, revisar demanda',
    'CX': 'Stock mínimo',
    'CY': 'Stock bajo o descontinuar',
    'CZ': 'Candidato a descontinuación'
  };

  return estrategias[matriz] || 'Estrategia pendiente';
}
