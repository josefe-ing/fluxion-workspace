/**
 * Servicio para Conjuntos Sustituibles (Pronóstico Jerárquico)
 * Sistema de productos intercambiables para optimización de inventario
 */

import http from './http';

// =====================================================================================
// INTERFACES / TIPOS
// =====================================================================================

export interface Conjunto {
  id: string;
  nombre: string;
  descripcion?: string;
  categoria?: string;
  activo: boolean;
  fecha_creacion: string;
  fecha_actualizacion: string;
  total_productos?: number;
  productos_activos?: number;
  demanda_diaria_total?: number;
}

export interface ConjuntoProducto {
  id: string;
  conjunto_id: string;
  codigo_producto: string;
  share_manual?: number;
  activo: boolean;
  fecha_agregado: string;
  descripcion?: string;
  categoria?: string;
  marca?: string;
  share_porcentaje?: number;
  demanda_diaria?: number;
  stock_actual?: number;
  dias_inventario?: number;
}

export interface ProductoDistribucion {
  codigo_producto: string;
  descripcion: string;
  marca?: string;
  share_original: number;
  share_ajustado: number;
  demanda_original: number;
  demanda_ajustada: number;
  stock_actual: number;
  stock_cd?: number;
  deficit: number;
  motivo_ajuste?: string;
}

export interface Alerta {
  tipo: 'redistribucion' | 'stockout' | 'warning' | 'info';
  mensaje: string;
  severidad: 'info' | 'warning' | 'error' | 'critical';
  productos_afectados?: string[];
}

export interface PronosticoJerarquico {
  conjunto_id: string;
  nombre: string;
  ubicacion_id?: string;
  dias_pronostico: number;
  demanda_total_conjunto: number;
  distribucion_normal: ProductoDistribucion[];
  distribucion_con_redistribucion: ProductoDistribucion[];
  alertas: Alerta[];
  productos_sin_stock_cd: number;
  porcentaje_redistribuido: number;
}

export interface ConjuntoCreate {
  nombre: string;
  descripcion?: string;
  categoria?: string;
  activo?: boolean;
}

export interface ConjuntoUpdate {
  nombre?: string;
  descripcion?: string;
  categoria?: string;
  activo?: boolean;
}

export interface ConjuntoProductoCreate {
  codigo_producto: string;
  share_manual?: number;
  activo?: boolean;
}

export interface ConjuntoProductoUpdate {
  share_manual?: number;
  activo?: boolean;
}

export interface ConjuntoListResponse {
  conjuntos: Conjunto[];
  total: number;
}

export interface ConjuntoDetalleResponse {
  conjunto: Conjunto;
  productos: ConjuntoProducto[];
  demanda_total_diaria: number;
}

// =====================================================================================
// ENDPOINTS CRUD - CONJUNTOS
// =====================================================================================

/**
 * Listar todos los conjuntos
 */
export async function listConjuntos(params?: {
  activo?: boolean;
  categoria?: string;
  skip?: number;
  limit?: number;
}): Promise<ConjuntoListResponse> {
  const searchParams = new URLSearchParams();
  if (params?.activo !== undefined) searchParams.append('activo', params.activo.toString());
  if (params?.categoria) searchParams.append('categoria', params.categoria);
  if (params?.skip !== undefined) searchParams.append('skip', params.skip.toString());
  if (params?.limit !== undefined) searchParams.append('limit', params.limit.toString());

  const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
  const response = await http.get(`/api/conjuntos/${query}`);
  return response.data;
}

/**
 * Obtener detalle de un conjunto específico
 */
export async function getConjunto(conjuntoId: string): Promise<ConjuntoDetalleResponse> {
  const response = await http.get(`/api/conjuntos/${conjuntoId}`);
  return response.data;
}

/**
 * Crear un nuevo conjunto
 */
export async function createConjunto(conjunto: ConjuntoCreate): Promise<Conjunto> {
  const response = await http.post('/api/conjuntos/', conjunto);
  return response.data;
}

/**
 * Actualizar un conjunto existente
 */
export async function updateConjunto(conjuntoId: string, conjunto: ConjuntoUpdate): Promise<Conjunto> {
  const response = await http.put(`/api/conjuntos/${conjuntoId}`, conjunto);
  return response.data;
}

/**
 * Eliminar (desactivar) un conjunto
 */
export async function deleteConjunto(conjuntoId: string): Promise<void> {
  await http.delete(`/api/conjuntos/${conjuntoId}`);
}

// =====================================================================================
// ENDPOINTS - PRODUCTOS EN CONJUNTO
// =====================================================================================

/**
 * Agregar producto a un conjunto
 */
export async function addProductoToConjunto(
  conjuntoId: string,
  producto: ConjuntoProductoCreate
): Promise<ConjuntoProducto> {
  const response = await http.post(`/api/conjuntos/${conjuntoId}/productos`, producto);
  return response.data;
}

/**
 * Actualizar producto en conjunto (share o estado)
 */
export async function updateProductoInConjunto(
  conjuntoId: string,
  codigoProducto: string,
  update: ConjuntoProductoUpdate
): Promise<ConjuntoProducto> {
  const response = await http.put(`/api/conjuntos/${conjuntoId}/productos/${codigoProducto}`, update);
  return response.data;
}

/**
 * Remover producto de conjunto
 */
export async function removeProductoFromConjunto(conjuntoId: string, codigoProducto: string): Promise<void> {
  await http.delete(`/api/conjuntos/${conjuntoId}/productos/${codigoProducto}`);
}

// =====================================================================================
// ENDPOINT - PRONÓSTICO JERÁRQUICO (CORE FEATURE)
// =====================================================================================

/**
 * Obtener pronóstico jerárquico con redistribución automática
 *
 * Este es el endpoint CORE que implementa la lógica de:
 * 1. Calcular demanda total del conjunto
 * 2. Calcular shares de cada producto
 * 3. Verificar disponibilidad en CD
 * 4. Redistribuir demanda si hay stockouts
 */
export async function getPronosticoJerarquico(
  conjuntoId: string,
  params?: {
    ubicacion_id?: string;
    dias?: number;
  }
): Promise<PronosticoJerarquico> {
  const searchParams = new URLSearchParams();
  if (params?.ubicacion_id) searchParams.append('ubicacion_id', params.ubicacion_id);
  if (params?.dias) searchParams.append('dias', params.dias.toString());

  const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
  const response = await http.get(`/api/conjuntos/${conjuntoId}/pronostico${query}`);
  return response.data;
}

// =====================================================================================
// UTILIDADES Y HELPERS
// =====================================================================================

/**
 * Obtener color según el tipo de alerta
 */
export function getColorAlerta(severidad: string): string {
  switch (severidad) {
    case 'critical':
      return 'bg-red-100 text-red-800 border-red-300';
    case 'error':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'warning':
      return 'bg-yellow-50 text-yellow-800 border-yellow-200';
    case 'info':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    default:
      return 'bg-gray-50 text-gray-700 border-gray-200';
  }
}

/**
 * Obtener icono según el tipo de alerta
 */
export function getIconoAlerta(tipo: string): string {
  switch (tipo) {
    case 'redistribucion':
      return '🔄';
    case 'stockout':
      return '⚠️';
    case 'warning':
      return '⚡';
    case 'info':
      return 'ℹ️';
    default:
      return '•';
  }
}

/**
 * Formatear porcentaje de share
 */
export function formatearShare(share?: number): string {
  if (share === undefined || share === null) return '-';
  return `${share.toFixed(1)}%`;
}

/**
 * Calcular diferencia de shares (ajustado vs original)
 */
export function calcularDiferenciaShare(original: number, ajustado: number): {
  diferencia: number;
  aumento: boolean;
  significativo: boolean;
} {
  const diferencia = ajustado - original;
  const aumento = diferencia > 0;
  const significativo = Math.abs(diferencia) > 5; // Más de 5% es significativo

  return { diferencia, aumento, significativo };
}

/**
 * Obtener color para visualización de share
 */
export function getColorShare(share: number): string {
  if (share >= 40) return 'bg-green-500';
  if (share >= 25) return 'bg-yellow-500';
  if (share >= 10) return 'bg-orange-500';
  return 'bg-red-500';
}

/**
 * Validar que shares sumen aproximadamente 100%
 */
export function validarSumaShares(productos: ConjuntoProducto[]): {
  valido: boolean;
  suma: number;
  mensaje?: string;
} {
  const suma = productos
    .filter(p => p.activo)
    .reduce((acc, p) => acc + (p.share_manual || 0), 0);

  const valido = suma >= 99 && suma <= 101;

  return {
    valido,
    suma,
    mensaje: !valido ? `Los shares suman ${suma.toFixed(1)}%, deberían sumar ~100%` : undefined
  };
}

/**
 * Calcular impacto de redistribución
 */
export function calcularImpactoRedistribucion(pronostico: PronosticoJerarquico): {
  productosAfectados: number;
  demandaRedistribuida: number;
  porcentajeImpacto: number;
} {
  const productosAfectados = pronostico.productos_sin_stock_cd;

  const demandaRedistribuida = pronostico.distribucion_con_redistribucion
    .reduce((acc, p) => {
      const diff = p.demanda_ajustada - p.demanda_original;
      return acc + (diff > 0 ? diff : 0);
    }, 0);

  const porcentajeImpacto = pronostico.demanda_total_conjunto > 0
    ? (demandaRedistribuida / pronostico.demanda_total_conjunto) * 100
    : 0;

  return {
    productosAfectados,
    demandaRedistribuida,
    porcentajeImpacto
  };
}

/**
 * Obtener recomendación basada en el pronóstico
 */
export function getRecomendacion(pronostico: PronosticoJerarquico): string {
  if (pronostico.productos_sin_stock_cd === 0) {
    return '✅ Todos los productos disponibles - usar distribución normal';
  }

  const totalProductos = pronostico.distribucion_normal.length;
  const porcentajeSinStock = (pronostico.productos_sin_stock_cd / totalProductos) * 100;

  if (porcentajeSinStock === 100) {
    return '🚨 CRÍTICO: Ningún producto disponible en CD - revisar abastecimiento urgente';
  }

  if (porcentajeSinStock > 50) {
    return '⚠️ ALERTA: Más del 50% sin stock - redistribución significativa requerida';
  }

  return `🔄 Redistribución automática activada para ${pronostico.productos_sin_stock_cd} producto(s)`;
}

/**
 * Obtener categorías únicas de conjuntos
 */
export async function getCategoriasConjuntos(): Promise<string[]> {
  const response = await listConjuntos({ limit: 1000 });
  const categorias = new Set<string>();

  response.conjuntos.forEach(c => {
    if (c.categoria) categorias.add(c.categoria);
  });

  return Array.from(categorias).sort();
}
