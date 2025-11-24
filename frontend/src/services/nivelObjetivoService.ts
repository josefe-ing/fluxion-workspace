/**
 * Servicio para gestionar Niveles Objetivo (Sistema v2.0)
 * Basado en ABC-XYZ y cálculo de stock de seguridad
 */

import http from './http';

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

export interface DatosCalculo {
  demanda_promedio_diaria: number;
  desviacion_estandar_diaria: number;
  periodo_reposicion_dias: number;
  nivel_servicio_z: number;
  multiplicador_demanda: number;
  multiplicador_ss: number;
  timestamp: string;
}

export interface NivelObjetivoData {
  producto_id: string;
  tienda_id: string;
  matriz_abc_xyz: string;
  demanda_promedio_diaria: number;
  desviacion_estandar_diaria: number;
  demanda_ciclo: number;
  stock_seguridad: number;
  nivel_objetivo: number;
  inventario_en_transito: number;
  metodo_calculo: string;
  datos_calculo: DatosCalculo;
}

export interface CantidadSugeridaData extends NivelObjetivoData {
  stock_actual: number;
  cantidad_sugerida: number;
}

export interface ProductoNivelObjetivo {
  // Identificación
  producto_id: string;
  nombre_producto: string;
  matriz_abc_xyz: string;
  cuadrante: string;  // Cuadrante numérico (I, II, III, etc.)

  // Promedios de demanda (en unidades base)
  demanda_promedio_diaria: number;
  demanda_5_dias: number;
  demanda_20_dias: number;
  demanda_mismo_dia: number;
  demanda_proyeccion: number;

  // Stock detallado
  stock_actual: number;
  stock_cedi: number;
  inventario_en_transito: number;
  stock_total: number;
  dias_stock_actual: number;

  // Parámetros de reorden (calculados)
  stock_minimo: number;
  stock_seguridad: number;
  punto_reorden: number;
  stock_maximo: number;

  // Nivel objetivo y sugerencia
  demanda_ciclo: number;
  nivel_objetivo: number;
  cantidad_sugerida: number;

  // Metadata
  prioridad: number;
  peso_kg: number;
  unidad_medida: string;
}

export interface NivelesInventarioTiendaResponse {
  success: boolean;
  tienda_id: string;
  tienda_nombre: string;
  total_productos: number;
  productos_calculados: number;
  productos_con_deficit: number;
  timestamp: string;
  productos: ProductoNivelObjetivo[];
}

export interface CalcularNivelObjetivoResponse {
  success: boolean;
  data: NivelObjetivoData;
}

export interface CalcularCantidadSugeridaResponse {
  success: boolean;
  data: CantidadSugeridaData;
}

export interface ClasificacionABCXYZData {
  // Clasificación ABC
  valor_ventas_total: number;
  percentil_abc: number;
  umbral_a: number;
  umbral_b: number;

  // Clasificación XYZ
  demanda_promedio: number;
  desviacion_estandar: number;
  coeficiente_variacion: number;

  // Parámetros aplicados
  nivel_servicio_z: number;
  multiplicador_demanda: number;
  multiplicador_ss: number;
  incluye_ss: boolean;
  prioridad: number;
}

export interface ClasificacionABCXYZResponse {
  success: boolean;
  producto_id: string;
  tienda_id: string;
  matriz_abc_xyz: string;
  clasificacion_data: ClasificacionABCXYZData;
}

// ============================================================================
// FUNCIONES DEL SERVICIO
// ============================================================================

/**
 * Calcula el nivel objetivo para un producto específico en una tienda
 */
export async function calcularNivelObjetivo(
  productoId: string,
  tiendaId: string
): Promise<CalcularNivelObjetivoResponse> {
  const response = await http.post('/api/niveles-inventario/calcular', {
    producto_id: productoId,
    tienda_id: tiendaId
  });
  return response.data;
}

/**
 * Calcula la cantidad sugerida para un producto
 */
export async function calcularCantidadSugerida(
  productoId: string,
  tiendaId: string,
  stockActual?: number
): Promise<CalcularCantidadSugeridaResponse> {
  const payload: any = {
    producto_id: productoId,
    tienda_id: tiendaId
  };

  if (stockActual !== undefined) {
    payload.stock_actual = stockActual;
  }

  const response = await http.post('/api/niveles-inventario/cantidad-sugerida', payload);
  return response.data;
}

/**
 * Obtiene los niveles objetivo para todos los productos de una tienda
 */
export async function obtenerNivelesTienda(
  tiendaId: string,
  opciones?: {
    limite?: number;
    soloConDeficit?: boolean;
  }
): Promise<NivelesInventarioTiendaResponse> {
  const params = new URLSearchParams();

  if (opciones?.limite) {
    params.append('limite', opciones.limite.toString());
  }

  if (opciones?.soloConDeficit) {
    params.append('solo_con_deficit', 'true');
  }

  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await http.get(`/api/niveles-inventario/tienda/${tiendaId}${query}`);
  return response.data;
}

// ============================================================================
// UTILIDADES
// ============================================================================

/**
 * Colores para badges de matriz ABC-XYZ
 */
export const COLORES_MATRIZ_ABC_XYZ: Record<string, { bg: string; text: string; border: string }> = {
  // Productos A (Alto valor)
  'AX': { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' },
  'AY': { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300' },
  'AZ': { bg: 'bg-red-100', text: 'text-red-600', border: 'border-red-300' },

  // Productos B (Medio valor)
  'BX': { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300' },
  'BY': { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-300' },
  'BZ': { bg: 'bg-orange-100', text: 'text-orange-600', border: 'border-orange-300' },

  // Productos C (Bajo valor)
  'CX': { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' },
  'CY': { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300' },
  'CZ': { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-300' },
};

/**
 * Descripciones de las matrices ABC-XYZ
 */
export const DESCRIPCIONES_MATRIZ: Record<string, { nombre: string; descripcion: string }> = {
  'AX': { nombre: 'Alto Valor, Estable', descripcion: 'Productos de alto valor con demanda predecible' },
  'AY': { nombre: 'Alto Valor, Variable', descripcion: 'Productos de alto valor con variabilidad media' },
  'AZ': { nombre: 'Alto Valor, Errático', descripcion: 'Productos de alto valor con demanda impredecible' },
  'BX': { nombre: 'Medio Valor, Estable', descripcion: 'Productos de valor medio con demanda predecible' },
  'BY': { nombre: 'Medio Valor, Variable', descripcion: 'Productos de valor medio con variabilidad media' },
  'BZ': { nombre: 'Medio Valor, Errático', descripcion: 'Productos de valor medio con demanda impredecible' },
  'CX': { nombre: 'Bajo Valor, Estable', descripcion: 'Productos de bajo valor con demanda predecible' },
  'CY': { nombre: 'Bajo Valor, Variable', descripcion: 'Productos de bajo valor con variabilidad media' },
  'CZ': { nombre: 'Bajo Valor, Errático', descripcion: 'Productos de bajo valor con demanda impredecible' },
};

/**
 * Prioridades de reposición por matriz
 */
export const PRIORIDADES_MATRIZ: Record<string, number> = {
  'AX': 1, 'AY': 2, 'AZ': 3,
  'BX': 4, 'BY': 5, 'BZ': 6,
  'CX': 7, 'CY': 8, 'CZ': 9,
};

/**
 * Obtiene el color para un badge de matriz ABC-XYZ
 */
export function obtenerColorMatriz(matriz: string) {
  return COLORES_MATRIZ_ABC_XYZ[matriz] || {
    bg: 'bg-gray-100',
    text: 'text-gray-600',
    border: 'border-gray-300'
  };
}

/**
 * Obtiene la descripción de una matriz
 */
export function obtenerDescripcionMatriz(matriz: string) {
  return DESCRIPCIONES_MATRIZ[matriz] || {
    nombre: 'Desconocido',
    descripcion: 'Clasificación no reconocida'
  };
}

/**
 * Formatea número con separador de miles
 */
export function formatearNumero(numero: number, decimales: number = 0): string {
  return numero.toLocaleString('es-VE', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales
  });
}

/**
 * Calcula días de stock actual
 */
export function calcularDiasStock(
  stockActual: number,
  enTransito: number,
  demandaDiaria: number
): number {
  if (demandaDiaria <= 0) return Infinity;
  return (stockActual + enTransito) / demandaDiaria;
}

/**
 * Obtiene etiqueta de nivel de servicio basado en Z-score
 */
export function obtenerNivelServicio(zScore: number): string {
  if (zScore >= 2.33) return '99.0%';
  if (zScore >= 1.96) return '97.5%';
  if (zScore >= 1.65) return '95.0%';
  if (zScore >= 1.28) return '90.0%';
  if (zScore >= 0.84) return '80.0%';
  return 'Básico';
}

/**
 * Determina si un producto tiene déficit
 */
export function tieneDeficit(cantidadSugerida: number): boolean {
  return cantidadSugerida > 0;
}

/**
 * Obtiene clase CSS para indicador de estado de stock
 */
export function obtenerClaseEstadoStock(diasStock: number, matriz: string): string {
  // Umbrales diferentes según la clase ABC
  const esClaseA = matriz.startsWith('A');
  const esClaseB = matriz.startsWith('B');

  if (diasStock === Infinity) return 'bg-gray-200';

  if (esClaseA) {
    if (diasStock < 2) return 'bg-red-500'; // Crítico
    if (diasStock < 3) return 'bg-orange-500'; // Bajo
    if (diasStock < 5) return 'bg-yellow-500'; // Moderado
    return 'bg-green-500'; // Bueno
  } else if (esClaseB) {
    if (diasStock < 1.5) return 'bg-red-500';
    if (diasStock < 2.5) return 'bg-orange-500';
    if (diasStock < 4) return 'bg-yellow-500';
    return 'bg-green-500';
  } else {
    // Clase C
    if (diasStock < 1) return 'bg-red-500';
    if (diasStock < 2) return 'bg-orange-500';
    if (diasStock < 3) return 'bg-yellow-500';
    return 'bg-green-500';
  }
}

/**
 * Obtiene los datos de clasificación ABC-XYZ de un producto
 */
export async function obtenerClasificacionProducto(
  tiendaId: string,
  productoId: string
): Promise<ClasificacionABCXYZResponse> {
  try {
    const response = await http.get(
      `/api/niveles-inventario/clasificacion/${tiendaId}/${productoId}`
    );
    return response.data as ClasificacionABCXYZResponse;
  } catch (error) {
    console.error('Error obteniendo clasificación ABC-XYZ:', error);
    throw error;
  }
}
