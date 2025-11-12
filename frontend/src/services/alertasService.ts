/**
 * Servicio para gestión de alertas de cambios de clasificación ABC-XYZ
 */

import http from './http';

// =====================================================================================
// TIPOS
// =====================================================================================

export interface Alerta {
  id: string;
  codigo_producto: string;
  producto_descripcion: string;
  categoria: string;
  marca: string;
  ubicacion_id: string;
  tipo_cambio: 'ABC' | 'XYZ' | 'MATRIZ';
  cambio_clasificacion: string;
  clasificacion_anterior: string;
  clasificacion_nueva: string;
  fecha_cambio: string;
  es_critico: boolean;
  nivel_prioridad: 'ALTA' | 'MEDIA' | 'BAJA';
  valor_anterior?: number;
  valor_nuevo?: number;
  cambio_porcentual?: number;
  ranking_anterior?: number;
  ranking_nuevo?: number;
  matriz_anterior?: string;
  matriz_nueva?: string;
  cv_anterior?: number;
  cv_nuevo?: number;
  accion_recomendada?: string;
  revisado: boolean;
  revisado_por?: string;
  revisado_fecha?: string;
  notas?: string;
}

export interface EstadisticasAlertas {
  total_en_periodo: number;
  criticas: number;
  alta_prioridad: number;
  pendientes: number;
  cambios_abc: number;
  cambios_xyz: number;
}

export interface ResumenAlertasTienda {
  ubicacion_id: string;
  total_alertas: number;
  alertas_criticas: number;
  prioridad_alta: number;
  prioridad_media: number;
  prioridad_baja: number;
  pendientes_revision: number;
  cambios_abc: number;
  cambios_xyz: number;
  ultima_alerta: string;
}

export interface HistoricoClasificacion {
  fecha_calculo: string;
  ubicacion_id: string;
  periodo_analisis: string;
  fecha_inicio: string;
  fecha_fin: string;
  clasificacion_abc_valor: string;
  valor_consumo_total: number;
  ranking_valor: number;
  porcentaje_valor: number;
  porcentaje_acumulado: number;
}

export interface ClasificacionActual {
  fecha_calculo: string;
  ubicacion_id: string;
  clasificacion_abc_valor: string;
  clasificacion_xyz: string;
  matriz_abc_xyz: string;
  valor_consumo_total: number;
  ranking_valor: number;
  coeficiente_variacion: number;
  demanda_promedio_semanal: number;
}

// =====================================================================================
// FUNCIONES DEL SERVICIO
// =====================================================================================

/**
 * Obtiene alertas de cambios de clasificación con filtros
 */
export async function getAlertasCambios(params: {
  ubicacion_id?: string;
  solo_pendientes?: boolean;
  solo_criticas?: boolean;
  dias?: number;
  limit?: number;
}): Promise<{
  alertas: Alerta[];
  total: number;
  estadisticas: EstadisticasAlertas;
}> {
  const queryParams = new URLSearchParams();

  if (params.ubicacion_id) queryParams.append('ubicacion_id', params.ubicacion_id);
  if (params.solo_pendientes !== undefined) queryParams.append('solo_pendientes', String(params.solo_pendientes));
  if (params.solo_criticas !== undefined) queryParams.append('solo_criticas', String(params.solo_criticas));
  if (params.dias) queryParams.append('dias', String(params.dias));
  if (params.limit) queryParams.append('limit', String(params.limit));

  const response = await http.get(`/api/alertas/cambios-clasificacion?${queryParams.toString()}`);
  return response.data;
}

/**
 * Obtiene resumen de alertas agrupadas por tienda
 */
export async function getResumenAlertasTiendas(dias: number = 30): Promise<{
  resumen: ResumenAlertasTienda[];
  total_tiendas: number;
}> {
  const response = await http.get(`/api/alertas/resumen-tiendas?dias=${dias}`);
  return response.data;
}

/**
 * Marca una alerta como revisada
 */
export async function marcarAlertaRevisada(
  alertaId: string,
  notas?: string
): Promise<{
  success: boolean;
  message: string;
  alerta_id: string;
  revisado_por: string;
}> {
  const response = await http.post(`/api/alertas/${alertaId}/revisar`, { notas });
  return response.data;
}

/**
 * Obtiene el histórico completo de clasificaciones ABC-XYZ de un producto
 */
export async function getHistoricoABCXYZ(
  codigo: string,
  ubicacion_id?: string,
  limit: number = 50
): Promise<{
  codigo_producto: string;
  clasificacion_actual: ClasificacionActual[];
  historico: HistoricoClasificacion[];
  total_registros: number;
}> {
  const queryParams = new URLSearchParams();
  if (ubicacion_id) queryParams.append('ubicacion_id', ubicacion_id);
  if (limit) queryParams.append('limit', String(limit));

  const response = await http.get(`/api/productos/${codigo}/historico-abc-xyz?${queryParams.toString()}`);
  return response.data;
}

/**
 * Calcula el color del badge según prioridad
 */
export function getColorPrioridad(prioridad: 'ALTA' | 'MEDIA' | 'BAJA'): string {
  switch (prioridad) {
    case 'ALTA':
      return 'bg-red-100 text-red-800 border-red-300';
    case 'MEDIA':
      return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    case 'BAJA':
      return 'bg-blue-100 text-blue-800 border-blue-300';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-300';
  }
}

/**
 * Calcula el ícono según tipo de cambio
 */
export function getIconoCambio(cambio: string): string {
  if (cambio.includes('_a_')) {
    const [desde, hacia] = cambio.split('_a_');
    if (desde === 'A' && hacia === 'C') return '🔴'; // Crítico
    if (desde === 'C' && hacia === 'A') return '🟢'; // Mejora significativa
    if (desde === 'X' && hacia === 'Z') return '⚠️'; // Volatilidad aumentó
    if (desde === 'Z' && hacia === 'X') return '✅'; // Se estabilizó
  }
  return '🟡'; // Cambio moderado
}

/**
 * Formatea el cambio para mostrar
 */
export function formatearCambio(clasificacion_anterior: string, clasificacion_nueva: string): string {
  return `${clasificacion_anterior} → ${clasificacion_nueva}`;
}

/**
 * Genera acción recomendada basada en el tipo de cambio
 */
export function getAccionRecomendada(alerta: Alerta): string {
  if (alerta.accion_recomendada) {
    return alerta.accion_recomendada;
  }

  // Generar recomendación por defecto
  const cambio = alerta.cambio_clasificacion;

  if (cambio === 'A_a_C') {
    return 'Revisar causa de caída en ventas. Verificar si es estacional o permanente. Considerar ajustar inventario.';
  }

  if (cambio === 'C_a_A') {
    return 'Producto emergente. Aumentar stock de seguridad y revisar niveles de reorden.';
  }

  if (alerta.tipo_cambio === 'XYZ' && alerta.clasificacion_anterior === 'X' && alerta.clasificacion_nueva === 'Z') {
    return 'Demanda se volvió errática. Aumentar stock de seguridad o revisar patrones estacionales.';
  }

  if (alerta.tipo_cambio === 'XYZ' && alerta.clasificacion_anterior === 'Z' && alerta.clasificacion_nueva === 'X') {
    return 'Demanda se estabilizó. Considerar optimizar stock de seguridad.';
  }

  return 'Revisar impacto en inventario y ajustar parámetros según nueva clasificación.';
}

export default {
  getAlertasCambios,
  getResumenAlertasTiendas,
  marcarAlertaRevisada,
  getHistoricoABCXYZ,
  getColorPrioridad,
  getIconoCambio,
  formatearCambio,
  getAccionRecomendada,
};
