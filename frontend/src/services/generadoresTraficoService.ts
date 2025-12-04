/**
 * Servicio para gestión de Generadores de Tráfico
 *
 * Productos que venden poco en $ pero aparecen en muchos tickets,
 * críticos para la experiencia del cliente.
 */

import http from './http';

// =====================================================================================
// TIPOS
// =====================================================================================

export interface GeneradorTrafico {
  producto_id: string;
  codigo: string;
  descripcion: string;
  venta_30d: number;
  tickets_30d: number;
  penetracion_pct: number;
  rank_venta: number;
  rank_penetracion: number;
  gap: number;
  clase_abc: string;
  es_generador_trafico: boolean;
  generador_trafico_sugerido: boolean;
  generador_trafico_ignorado: boolean;
  estado: 'activo' | 'sugerido' | 'ignorado' | 'ninguno';
  fecha_marcado?: string;
  fecha_sugerido?: string;
}

export interface ResumenGeneradoresTrafico {
  total_activos: number;
  total_sugeridos: number;
  total_ignorados: number;
  productos_clase_c: number;
  gap_promedio_activos: number;
  gap_minimo_config: number;
  ultima_actualizacion?: string;
}

export interface HistorialGeneradorTrafico {
  id: number;
  producto_id: string;
  accion: string;
  gap_score: number;
  venta_30d: number;
  tickets_30d: number;
  penetracion_pct: number;
  clase_abc: string;
  usuario: string;
  comentario?: string;
  fecha: string;
}

export interface ConfigGeneradorTrafico {
  gap_minimo: number;
  clase_abc_requerida: string;
  stock_seguridad_extra_pct: number;
  producto_excluido_bolsas: string;
  dias_analisis: number;
  frecuencia_calculo: string;
}

export type TabType = 'sugeridos' | 'activos' | 'todos_c' | 'ignorados';

// =====================================================================================
// FUNCIONES API
// =====================================================================================

/**
 * Obtiene el resumen de generadores de tráfico
 */
export const getResumen = async (): Promise<ResumenGeneradoresTrafico> => {
  const response = await http.get('/api/generadores-trafico/resumen');
  return response.data;
};

/**
 * Obtiene la lista de productos según el tab seleccionado
 */
export const getProductos = async (
  tab: TabType,
  limit: number = 100,
  offset: number = 0
): Promise<{ productos: GeneradorTrafico[]; total: number }> => {
  const response = await http.get('/api/generadores-trafico/productos', {
    params: { tab, limit, offset }
  });
  return response.data;
};

/**
 * Marca un producto como generador de tráfico (o lo quita)
 */
export const marcarProducto = async (
  productoId: string,
  accion: 'aprobar' | 'rechazar' | 'remover' | 'ignorar',
  comentario?: string,
  usuario?: string
): Promise<{ success: boolean; message: string }> => {
  const response = await http.post('/api/generadores-trafico/marcar', {
    producto_id: productoId,
    accion,
    comentario,
    usuario
  });
  return response.data;
};

/**
 * Ejecuta el cálculo de sugerencias
 */
export const calcularSugerencias = async (): Promise<{
  success: boolean;
  nuevos_sugeridos: number;
  actualizados: number;
  message: string;
}> => {
  const response = await http.post('/api/generadores-trafico/calcular-sugerencias', {});
  return response.data;
};

/**
 * Obtiene el historial de un producto
 */
export const getHistorial = async (
  productoId: string,
  limit: number = 20
): Promise<HistorialGeneradorTrafico[]> => {
  const response = await http.get(`/api/generadores-trafico/historial/${productoId}`, {
    params: { limit }
  });
  return response.data;
};

/**
 * Obtiene la configuración actual
 */
export const getConfig = async (): Promise<ConfigGeneradorTrafico> => {
  const response = await http.get('/api/generadores-trafico/config');
  return response.data;
};

/**
 * Actualiza un parámetro de configuración
 */
export const updateConfig = async (
  parametro: string,
  valor: string
): Promise<{ success: boolean; message: string }> => {
  const response = await http.post('/api/generadores-trafico/config', {
    parametro,
    valor
  });
  return response.data;
};

// =====================================================================================
// UTILIDADES
// =====================================================================================

/**
 * Formatea el monto en moneda local
 */
export const formatMonto = (valor: number): string => {
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(valor);
};

/**
 * Obtiene el color del badge según el estado
 */
export const getColorEstado = (estado: string): string => {
  switch (estado) {
    case 'activo':
      return 'bg-green-100 text-green-800 border-green-300';
    case 'sugerido':
      return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    case 'ignorado':
      return 'bg-gray-100 text-gray-600 border-gray-300';
    default:
      return 'bg-gray-50 text-gray-500 border-gray-200';
  }
};

/**
 * Obtiene el color del GAP score
 */
export const getColorGap = (gap: number): string => {
  if (gap >= 600) return 'text-red-600 font-bold';
  if (gap >= 400) return 'text-orange-600 font-semibold';
  if (gap >= 200) return 'text-yellow-600';
  return 'text-gray-600';
};

/**
 * Obtiene el icono de estado
 */
export const getIconoEstado = (estado: string): string => {
  switch (estado) {
    case 'activo':
      return '✅';
    case 'sugerido':
      return '💡';
    case 'ignorado':
      return '🚫';
    default:
      return '⚪';
  }
};
