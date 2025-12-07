/**
 * Servicio para gestionar Pedidos Sugeridos
 * Maneja el flujo completo: calcular, guardar, aprobar, rechazar
 */

import http from './http';

export interface PedidoSugerido {
  id: string;
  numero_pedido: string;
  fecha_pedido: string;
  fecha_creacion: string;
  cedi_origen_nombre: string;
  tienda_destino_nombre: string;
  estado: string;
  prioridad: string;
  tipo_pedido: string;
  total_productos: number;
  total_bultos: number;
  total_unidades: number;
  tiene_devoluciones?: boolean;
  total_productos_devolucion?: number;
  total_bultos_devolucion?: number;
  tiene_comentarios_gerente?: boolean;
  usuario_creador: string;
  dias_desde_creacion: number;
  porcentaje_avance: number;
}

export interface ProductoDetalle {
  codigo_producto: string;
  descripcion_producto: string;
  cantidad_sugerida_bultos: number;
  cantidad_pedida_bultos: number;
  comentario_gerente?: string;
  aprobado_por_gerente?: boolean;
}

/**
 * Lista todos los pedidos sugeridos con filtros opcionales
 */
export async function listarPedidos(filtros?: {
  estado?: string;
  tienda_id?: string;
}): Promise<PedidoSugerido[]> {
  const params = new URLSearchParams();
  if (filtros?.estado) params.append('estado', filtros.estado);
  if (filtros?.tienda_id) params.append('tienda_id', filtros.tienda_id);

  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await http.get(`/api/pedidos-sugeridos/${query}`);
  return response.data;
}

/**
 * Obtiene un pedido específico con todos sus detalles
 */
export async function obtenerPedido(pedidoId: string): Promise<any> {
  const response = await http.get(`/api/pedidos-sugeridos/${pedidoId}`);
  return response.data;
}

/**
 * Envía un pedido para aprobación del gerente
 */
export async function enviarParaAprobacion(pedidoId: string): Promise<{
  success: boolean;
  message: string;
  estado_nuevo: string;
}> {
  const response = await http.post(`/api/pedidos-sugeridos/${pedidoId}/enviar-aprobacion`, {});
  return response.data;
}

/**
 * Gerente aprueba un pedido
 */
export async function aprobarPedido(
  pedidoId: string,
  comentarioGeneral?: string
): Promise<{
  success: boolean;
  message: string;
  numero_pedido: string;
  estado_nuevo: string;
}> {
  const response = await http.post(`/api/pedidos-sugeridos/${pedidoId}/aprobar`, {
    comentario_general: comentarioGeneral
  });
  return response.data;
}

/**
 * Gerente rechaza un pedido
 */
export async function rechazarPedido(
  pedidoId: string,
  motivo: string
): Promise<{
  success: boolean;
  message: string;
  numero_pedido: string;
  estado_nuevo: string;
  motivo: string;
}> {
  const response = await http.post(`/api/pedidos-sugeridos/${pedidoId}/rechazar`, {
    motivo
  });
  return response.data;
}

/**
 * Agrega un comentario a un producto específico
 */
export async function agregarComentarioProducto(
  pedidoId: string,
  productoConfig: string,
  comentario: string
): Promise<{
  success: boolean;
  message: string;
}> {
  const response = await http.post(
    `/api/pedidos-sugeridos/${pedidoId}/productos/${productoConfig}/comentario`,
    { comentario }
  );
  return response.data;
}

/**
 * Elimina un pedido en estado borrador
 */
export async function eliminarPedido(pedidoId: string): Promise<{
  success: boolean;
  mensaje: string;
  pedido_id: string;
  numero_pedido: string;
}> {
  const response = await http.delete(`/api/pedidos-sugeridos/${pedidoId}`);
  return response.data;
}

/**
 * Estados posibles de un pedido
 */
export const ESTADOS_PEDIDO = {
  BORRADOR: 'borrador',
  PENDIENTE_APROBACION_GERENTE: 'pendiente_aprobacion_gerente',
  RECHAZADO_GERENTE: 'rechazado_gerente',
  APROBADO_GERENTE: 'aprobado_gerente',
  FINALIZADO: 'finalizado',
  CANCELADO: 'cancelado'
} as const;

/**
 * Labels amigables para los estados
 */
export const ESTADO_LABELS: Record<string, string> = {
  [ESTADOS_PEDIDO.BORRADOR]: 'Borrador',
  [ESTADOS_PEDIDO.PENDIENTE_APROBACION_GERENTE]: 'Pendiente de Aprobación',
  [ESTADOS_PEDIDO.RECHAZADO_GERENTE]: 'Rechazado',
  [ESTADOS_PEDIDO.APROBADO_GERENTE]: 'Aprobado',
  [ESTADOS_PEDIDO.FINALIZADO]: 'Finalizado',
  [ESTADOS_PEDIDO.CANCELADO]: 'Cancelado'
};

/**
 * Colores para los badges de estado
 */
export const ESTADO_COLORS: Record<string, string> = {
  [ESTADOS_PEDIDO.BORRADOR]: 'bg-gray-100 text-gray-800',
  [ESTADOS_PEDIDO.PENDIENTE_APROBACION_GERENTE]: 'bg-yellow-100 text-yellow-800',
  [ESTADOS_PEDIDO.RECHAZADO_GERENTE]: 'bg-red-100 text-red-800',
  [ESTADOS_PEDIDO.APROBADO_GERENTE]: 'bg-green-100 text-green-800',
  [ESTADOS_PEDIDO.FINALIZADO]: 'bg-blue-100 text-blue-800',
  [ESTADOS_PEDIDO.CANCELADO]: 'bg-gray-100 text-gray-800'
};
